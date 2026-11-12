// Fetching a web page or image that a USER gave us the address to.
// That is risky on a server: someone could point us at our own network (localhost, 10.x, the cloud's
// metadata service …). So:
//  - only http/https on the standard ports
//  - every address the name points to must be public - checked in the connection's own DNS lookup,
//    so the name can't change to a private address between the check and the request
//  - redirects are followed by hand (max 5), and every hop is checked the same way
//  - a total timeout, and a maximum size
// No extra packages - only Node's own http/https.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

export class FetchError extends Error {
    constructor(message, status = null) {
        super(message);
        this.status = status;
    }
}

const MAX_REDIRECTS = 5;
const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Wrappd/1.0";

// Addresses that are never fetched: private networks, localhost, link-local, multicast, reserved …
const blocked = new net.BlockList();
for (const [address, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
]) {
    blocked.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["64:ff9b::", 96],
    ["100::", 64],
    ["2001:db8::", 32],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
]) {
    blocked.addSubnet(address, prefix, "ipv6");
}

export function isPublicAddress(address) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address); // IPv4 written as IPv6
    if (mapped) return isPublicAddress(mapped[1]);
    if (net.isIPv4(address)) return !blocked.check(address, "ipv4");
    if (net.isIPv6(address)) return !blocked.check(address, "ipv6");
    return false;
}

// Used by the connection itself - so the address we check is the address we connect to
function safeLookup(hostname, options, callback) {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
        if (err) return callback(err);
        if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
            return callback(new FetchError("Adressen pekar inte på en publik webbplats"));
        }
        if (options?.all) return callback(null, addresses);
        callback(null, addresses[0].address, addresses[0].family);
    });
}

function checkUrl(url) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("Bara http- och https-länkar");
    if (url.port && url.port !== "80" && url.port !== "443") throw new FetchError("Länken använder en port som inte stöds");
    if (url.username || url.password) throw new FetchError("Länken får inte innehålla inloggningsuppgifter");
    // An IP address in the link never goes through the DNS lookup - check it here
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) throw new FetchError("Adressen pekar inte på en publik webbplats");
}

function decompress(res) {
    const encoding = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
    if (encoding === "gzip" || encoding === "x-gzip") return res.pipe(zlib.createGunzip());
    if (encoding === "deflate") return res.pipe(zlib.createInflate());
    if (encoding === "br") return res.pipe(zlib.createBrotliDecompress());
    return res;
}

// One request, no redirects followed
function requestOnce(url, { accept, maxBytes, truncate, signal }) {
    return new Promise((resolve, reject) => {
        const client = url.protocol === "https:" ? https : http;
        const req = client.get(
            url,
            {
                lookup: safeLookup,
                signal,
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: accept,
                    "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
                    "Accept-Encoding": "gzip, deflate, br",
                },
            },
            (res) => {
                const status = res.statusCode ?? 0;
                if (status >= 300 && status < 400 && res.headers.location) {
                    res.resume();
                    return resolve({ redirect: new URL(res.headers.location, url) });
                }
                if (status < 200 || status >= 300) {
                    res.resume();
                    return reject(new FetchError(`Sidan svarade ${status}`, status));
                }
                if (!truncate && Number(res.headers["content-length"]) > maxBytes) {
                    res.destroy();
                    return reject(new FetchError("Filen är för stor"));
                }

                const stream = decompress(res);
                const chunks = [];
                let size = 0;
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    resolve({ buffer: Buffer.concat(chunks), contentType: String(res.headers["content-type"] ?? ""), url });
                };

                stream.on("data", (chunk) => {
                    if (done) return;
                    size += chunk.length;
                    if (size > maxBytes) {
                        if (truncate) {
                            // A web page: the start is enough (the product data is in <head> or early in <body>)
                            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
                            finish();
                        } else {
                            done = true;
                            reject(new FetchError("Filen är för stor"));
                        }
                        res.destroy();
                        return;
                    }
                    chunks.push(chunk);
                });
                stream.on("end", finish);
                stream.on("error", (err) => {
                    if (!done) {
                        done = true;
                        reject(err);
                    }
                });
            }
        );
        req.on("error", reject);
    });
}

/**
 * GET a user-given address, safely.
 * @param {string} address
 * @param {{ accept?: string, maxBytes?: number, truncate?: boolean, timeoutMs?: number }} options
 *   truncate: true keeps the first maxBytes (web pages); false fails if larger (images)
 * @returns {Promise<{ buffer: Buffer, contentType: string, url: URL }>}
 */
export async function safeFetch(address, { accept = "*/*", maxBytes = 2 * 1024 * 1024, truncate = false, timeoutMs = 10_000 } = {}) {
    const signal = AbortSignal.timeout(timeoutMs);
    let url;
    try {
        url = new URL(address);
    } catch {
        throw new FetchError("Länken är inte en giltig webbadress");
    }

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        checkUrl(url);
        let result;
        try {
            result = await requestOnce(url, { accept, maxBytes, truncate, signal });
        } catch (err) {
            if (err instanceof FetchError) throw err;
            if (signal.aborted) throw new FetchError("Sidan svarade inte i tid");
            throw new FetchError("Kunde inte nå sidan");
        }
        if (!result.redirect) return result;
        url = result.redirect;
    }
    throw new FetchError("Sidan skickar vidare för många gånger");
}

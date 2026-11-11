import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { APP_NAME } from "../config.js";

// /integritet – privacy policy and cookies. Open without logging in.
// Change the policy here, and update UPDATED. The facts (where data is stored, which services)
// must match reality – check them when the setup changes (e.g. moving the database to the EU).
const UPDATED = "11 november 2026";
const CONTROLLER = "Kirakira"; // who is responsible for the personal data – check that this is right
const CONTACT = "hej@wrappd.se";

export default function PrivacyPage() {
    const { user } = useAuth();
    const { hash } = useLocation();

    // "Läs mer" in the cookie notice links to #cookies – React Router doesn't scroll to it by itself
    useEffect(() => {
        if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
        else window.scrollTo(0, 0);
    }, [hash]);

    return (
        <div className="auth">
            <article className="auth-card legal">
                <p className="auth-logo">
                    <Link to="/" className="logo">
                        <img src="/logo.png" alt={APP_NAME} id="logo" />
                    </Link>
                </p>
                <h1>Integritetspolicy och cookies</h1>
                <p className="muted small">Senast uppdaterad {UPDATED}</p>

                <p>
                    {APP_NAME} är en tjänst för önskelistor och gåvor. Här beskriver vi vilka uppgifter vi sparar om
                    dig, varför, var de finns och vad du kan göra med dem. Vi säljer aldrig dina uppgifter, och vi
                    använder dem inte för reklam eller marknadsföring.
                </p>

                <h2>Vem ansvarar för dina uppgifter?</h2>
                <p>
                    {CONTROLLER} är personuppgiftsansvarig för {APP_NAME}. Har du frågor, eller vill du använda dina
                    rättigheter, mejla <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
                </p>

                <h2>Vilka uppgifter sparar vi?</h2>
                <ul>
                    <li>
                        <strong>Ditt konto:</strong> namn, användarnamn, e-postadress, lösenord (bara som en
                        krypterad hash – vi kan aldrig se det) och vald profilikon och färg. Loggar du in med Google
                        sparar vi också Googles id för ditt konto, din e-postadress och ditt namn därifrån.
                    </li>
                    <li>
                        <strong>Det du lägger in:</strong> grupper, listor, önskningar (med bilder och länkar),
                        gåvor och reservationer, Secret Santa och din önskeprofil (vad du gillar och inte gillar).
                    </li>
                    <li>
                        <strong>Det andra lägger in om dig:</strong> en admin i en grupp kan skapa ett konto åt dig
                        (namn och användarnamn), och andra kan göra listor till dig och reservera dina önskningar. Du
                        ser aldrig vad som reserverats åt dig.
                    </li>
                    <li>
                        <strong>Barn:</strong> föräldrar kan lägga in sina barn med namn, önskeprofil och listor. Barn
                        har inga egna konton och kan inte logga in. Den som lägger in ett barn ansvarar för att det är
                        okej.
                    </li>
                    <li>
                        <strong>Tekniska uppgifter:</strong> när du använder tjänsten loggar våra servrar tekniska
                        uppgifter som IP-adress och tidpunkt, för drift och säkerhet. Loggarna sparas en kort tid.
                    </li>
                </ul>

                <h2>Varför sparar vi dem?</h2>
                <p>
                    För att kunna ge dig tjänsten: logga in dig, visa dina grupper och listor och låta er hålla koll på
                    gåvor tillsammans (rättslig grund: avtal). Tekniska loggar sparar vi för att hålla tjänsten säker
                    och fungerande (rättslig grund: berättigat intresse). Din e-postadress använder vi för att kunna
                    koppla ditt konto till Google och för att kunna nå dig om ditt konto – aldrig för marknadsföring.
                </p>

                <h2>Vem kan se dem?</h2>
                <p>
                    Ditt namn, användarnamn och din profilikon syns för andra i dina grupper, och andra kan hitta dig
                    genom att söka på ditt exakta användarnamn. Listor och önskningar syns för de grupper de delas med.
                    Din e-postadress visas inte för andra användare.
                </p>

                <h2>Var lagras de?</h2>
                <p>Vi använder några tjänsteleverantörer (personuppgiftsbiträden), som bara får hantera uppgifterna åt oss:</p>
                <ul>
                    <li>
                        <strong>Vercel</strong> – driften av webbplatsen och servern, och lagring av bilder.
                    </li>
                    <li>
                        <strong>Neon</strong> – databasen där kontot och allt du lägger in sparas.
                    </li>
                    <li>
                        <strong>Google</strong> – inloggning med Google, om du väljer det. Typsnittet på sidan hämtas
                        också från Google Fonts, vilket betyder att din webbläsare kontaktar Google.
                    </li>
                </ul>
                <p>
                    Uppgifterna lagras i USA. Överföringen skyddas av EU:s och USA:s ramverk för dataskydd (Data Privacy
                    Framework) och/eller EU-kommissionens standardavtalsklausuler.
                </p>

                <h2>Hur länge sparar vi dem?</h2>
                <p>
                    Så länge du har ett konto. Du kan radera ditt konto själv under <strong>Min profil</strong> →{" "}
                    <strong>Radera mitt konto</strong>. Då raderas kontot och det som bara är ditt; det du delar med
                    andra (till exempel gåvor ni köpt tillsammans) finns kvar för dem. Du kan också mejla{" "}
                    <a href={`mailto:${CONTACT}`}>{CONTACT}</a> så hjälper vi dig. Ett konto
                    som en admin har skapat åt dig, men som aldrig aktiverats, raderas när det tas bort ur sin sista
                    grupp.
                </p>

                <h2>Dina rättigheter</h2>
                <p>
                    Du har rätt att få veta vilka uppgifter vi har om dig, få fel rättade, få uppgifterna raderade, få
                    ut dem i ett maskinläsbart format och invända mot hur vi använder dem. Mejla oss, så svarar vi inom
                    en månad. Är du inte nöjd med hur vi hanterar dina uppgifter kan du klaga hos{" "}
                    <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer">
                        Integritetsskyddsmyndigheten (IMY)
                    </a>
                    .
                </p>

                <h2 id="cookies">Cookies och lagring i webbläsaren</h2>
                <p>
                    Vi använder bara det som behövs för att tjänsten ska fungera – inga cookies för statistik,
                    analys eller reklam. Därför behöver vi inte ditt samtycke, men du ska veta vad som sparas:
                </p>
                <div className="table-scroll">
                    <table className="legal-table">
                        <thead>
                            <tr>
                                <th scope="col">Namn</th>
                                <th scope="col">Vad det gör</th>
                                <th scope="col">Hur länge</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    <code>wrappd_token</code> (cookie)
                                </td>
                                <td>Håller dig inloggad. Kan inte läsas av JavaScript.</td>
                                <td>1 år, eller tills du loggar ut</td>
                            </tr>
                            <tr>
                                <td>
                                    <code>cookieNoticeSeen</code> (lokal lagring)
                                </td>
                                <td>Kommer ihåg att du har sett informationen om cookies.</td>
                                <td>Tills du rensar webbläsaren</td>
                            </tr>
                            <tr>
                                <td>
                                    <code>emailPromptDismissed</code> (sessionslagring)
                                </td>
                                <td>Kommer ihåg att du valt "Inte nu" när vi frågade efter din e-post.</td>
                                <td>Tills du stänger fliken</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    Använder du knappen "Logga in med Google" laddas den från Google, som då kan sätta egna cookies.
                    Det styrs av{" "}
                    <a href="https://policies.google.com/privacy?hl=sv" target="_blank" rel="noopener noreferrer">
                        Googles integritetspolicy
                    </a>
                    .
                </p>

                <h2>Ändringar</h2>
                <p>
                    Ändrar vi något viktigt i den här policyn uppdaterar vi datumet högst upp och berättar om det i
                    tjänsten.
                </p>

                <p className="auth-switch">
                    <Link to={user ? "/" : "/login"}>{user ? "Tillbaka till Wrappd" : "Till inloggningen"}</Link>
                </p>
            </article>
        </div>
    );
}

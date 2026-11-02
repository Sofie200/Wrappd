// Amounts in kronor, from text a user typed: "299", "299,50", "1 299" → 299 / 299.5 / 1299. Empty → null.
import { z } from "zod";

export const money = (message = "Ange ett belopp, t.ex. 299 eller 299,50") =>
    z
        .union([z.string(), z.number()])
        .nullish()
        .transform((value, ctx) => {
            const text = String(value ?? "").replace(/\s/g, "");
            if (!text) return null;
            if (!/^\d{1,8}([.,]\d{1,2})?$/.test(text)) {
                ctx.addIssue({ code: "custom", message });
                return z.NEVER;
            }
            return Number(text.replace(",", "."));
        });

// Kronor → öre, so sums can be compared exactly (0.1 + 0.2 !== 0.3 in JavaScript)
export const toOre = (kr) => Math.round(Number(kr) * 100);

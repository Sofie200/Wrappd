// The rules for name, username and password – shared by registration, admin-created users and links
import { z } from "zod";

export const name = z
    .string({ error: "Ange ett namn" })
    .trim()
    .min(1, "Ange ett namn")
    .max(80, "Namnet får vara högst 80 tecken");

export const username = z
    .string({ error: "Ange ett användarnamn" })
    .trim()
    .toLowerCase()
    .regex(
        /^[a-z0-9._-]{3,30}$/,
        "Användarnamnet ska vara 3–30 tecken: a–z, siffror, punkt, bindestreck eller understreck"
    );

export const password = z
    .string({ error: "Ange ett lösenord" })
    .min(8, "Lösenordet ska vara minst 8 tecken")
    .max(200, "Lösenordet får vara högst 200 tecken");

// The profile icon and its colour – the same values as the CHECKs in db/schema.sql
export const AVATAR_ICONS = ["user", "cat", "dog", "rabbit", "flower"];
export const AVATAR_COLORS = ["pink", "orange", "green", "purple", "blue"];

export const avatarIcon = z.enum(AVATAR_ICONS, { error: "Välj en av ikonerna" });
export const avatarColor = z.enum(AVATAR_COLORS, { error: "Välj en av färgerna" });

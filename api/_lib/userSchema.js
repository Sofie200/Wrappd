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

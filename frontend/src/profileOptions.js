// The profile icon: 5 icons × 5 colours. The keys are what's saved in the database
// (the same values as in api/_lib/userSchema.js and the CHECKs in db/schema.sql).
import { Cat, Dog, Flower2, Rabbit, User } from "lucide-react";

export const AVATAR_ICONS = {
    user: { label: "Person", Icon: User },
    cat: { label: "Katt", Icon: Cat },
    dog: { label: "Hund", Icon: Dog },
    rabbit: { label: "Kanin", Icon: Rabbit },
    flower: { label: "Blomma", Icon: Flower2 },
};

export const AVATAR_COLORS = {
    pink: { label: "Rosa", value: "#ec556f" },
    orange: { label: "Orange", value: "#f08c1a" },
    green: { label: "Grön", value: "#5aa859" },
    purple: { label: "Lila", value: "#aa72c2" },
    blue: { label: "Blå", value: "#4a8fc7" },
};

export const DEFAULT_ICON = "user";
export const DEFAULT_COLOR = "pink";

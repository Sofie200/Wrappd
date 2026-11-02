// The profile icon: 14 icons × 5 colours. The keys are what's saved in the database
// (the same values as in api/_lib/userSchema.js and the CHECKs in db/schema.sql).
import {
    Banana,
    Bird,
    Bug,
    Cat,
    Citrus,
    Coffee,
    Germ,
    Ghost,
    HandMetal,
    Lollipop,
    Snail,
    Squirrel,
    Sun,
    User,
} from "lucide-react";

export const AVATAR_ICONS = {
    user: { label: "Person", Icon: User },
    cat: { label: "Katt", Icon: Cat },
    snail: { label: "Snigel", Icon: Snail },
    bug: { label: "Insekt", Icon: Bug },
    bird: { label: "Fågel", Icon: Bird },
    ghost: { label: "Spöke", Icon: Ghost },
    banana: { label: "Banan", Icon: Banana },
    "hand-metal": { label: "Rock on", Icon: HandMetal },
    citrus: { label: "Citrus", Icon: Citrus },
    lollipop: { label: "Klubba", Icon: Lollipop },
    coffee: { label: "Kaffe", Icon: Coffee },
    squirrel: { label: "Ekorre", Icon: Squirrel },
    sun: { label: "Sol", Icon: Sun },
    germ: { label: "Bacill", Icon: Germ },
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

// Categories in the wish profile – someone can like or not like each. The keys are what's saved
// (the same list is in api/_lib/profileSchema.js).
import {
    BookOpen, Candy, Clapperboard, Coffee, Dumbbell, Gamepad2, Gem, Headphones, Palette, PawPrint, Plane,
    Puzzle, Shirt, Smartphone, Sofa, Sparkles, Sprout, Tent, Ticket, ToyBrick, UtensilsCrossed,
} from "lucide-react";

export const WISH_CATEGORIES = [
    { key: "books", label: "Böcker", Icon: BookOpen },
    { key: "games", label: "Spel", Icon: Gamepad2 },
    { key: "toys", label: "Leksaker", Icon: Puzzle },
    { key: "lego", label: "Lego & bygg", Icon: ToyBrick },
    { key: "sweets", label: "Godis & choklad", Icon: Candy },
    { key: "food", label: "Mat & dryck", Icon: UtensilsCrossed },
    { key: "coffee-tea", label: "Kaffe & te", Icon: Coffee },
    { key: "home", label: "Inredning", Icon: Sofa },
    { key: "plants", label: "Växter", Icon: Sprout },
    { key: "clothes", label: "Kläder", Icon: Shirt },
    { key: "jewellery", label: "Smycken", Icon: Gem },
    { key: "beauty", label: "Skönhet & hudvård", Icon: Sparkles },
    { key: "sport", label: "Sport & träning", Icon: Dumbbell },
    { key: "outdoors", label: "Friluftsliv", Icon: Tent },
    { key: "tech", label: "Teknik & prylar", Icon: Smartphone },
    { key: "music", label: "Musik", Icon: Headphones },
    { key: "film", label: "Film & serier", Icon: Clapperboard },
    { key: "crafts", label: "Pyssel & konst", Icon: Palette },
    { key: "experiences", label: "Upplevelser", Icon: Ticket },
    { key: "travel", label: "Resor", Icon: Plane },
    { key: "animals", label: "Djur", Icon: PawPrint },
];

export const categoryByKey = Object.fromEntries(WISH_CATEGORIES.map((c) => [c.key, c]));

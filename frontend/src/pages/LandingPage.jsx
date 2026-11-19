import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    Baby,
    ChartColumn,
    Check,
    CirclePlus,
    EyeOff,
    Gift,
    HatGlasses,
    Heart,
    Link2,
    ScrollText,
    Sparkles,
    Users,
} from "lucide-react";
import Footer from "../components/Footer.jsx";
import { APP_NAME } from "../config.js";

// The start page for visitors who aren't logged in (shown on / by RequireAuth): what Wrappd is, why it's
// nice, how it works - and "Skapa konto" / "Logga in". Logged in, / is the overview as before.
// Built from the app's own look: the backdrop, the white sheet, the rose intro band with the zigzag edge,
// the coloured event panels and the wish rows - so what you see here is what you get inside.

const FEATURES = [
    {
        icon: ScrollText,
        title: "Önskelistor till allt",
        text: "Jul, födelsedag, bröllop eller studenten. Lägg till önskningar med en produktlänk - bild, pris och beskrivning fylls i åt dig.",
    },
    {
        icon: EyeOff,
        title: "Hemligt för mottagaren",
        text: "Alla andra ser vad som är reserverat, men aldrig den som listan är till. Överraskningen håller hela vägen.",
    },
    {
        icon: Users,
        title: "Grupper för familj och vänner",
        text: "Samla familjen, kompisgänget eller jobbet i en grupp. Listorna syns för gruppen - ingen annan.",
    },
    {
        icon: HatGlasses,
        title: "Secret Santa på några sekunder",
        text: "Lotta vem som ger till vem. Bara du ser vem du fick - och du kan reservera direkt från hens önskeprofil.",
    },
    {
        icon: Baby,
        title: "Barnens önskningar också",
        text: "Skapa profiler för barnen och gör listor åt dem. Mor- och farföräldrar vet äntligen vad som önskas.",
    },
    {
        icon: ChartColumn,
        title: "Koll på gåvorna",
        text: "Se vad du har köpt, till vem och vad det kostade. Dela på dyrare gåvor - Wrappd räknar ut vem som betalar vad.",
    },
];

const STEPS = [
    { title: "Skapa ett konto", text: "Med e-post eller Google. Det tar under en minut." },
    { title: "Samla din grupp", text: "Bjud in familjen eller vännerna - eller lägg till barnen själv." },
    { title: "Önska och reservera", text: "Gör en lista, dela den, och se önskningarna bli reserverade. I hemlighet." },
];

export default function LandingPage() {
    // The browser tab: the app's name and what it is
    useEffect(() => {
        document.title = `${APP_NAME} - önskelistor och gåvor`;
    }, []);

    return (
        <div className="app landing">
            <header className="header">
                <div className="header-inner">
                    <Link to="/" className="logo">
                        <img src="/logo.png" alt={APP_NAME} id="logo" />
                    </Link>
                    <nav className="landing-nav" aria-label="Konto">
                        <Link to="/login" className="btn btn-small btn-ghost">
                            Logga in
                        </Link>
                        <Link to="/register" className="btn btn-small btn-primary">
                            Skapa konto
                        </Link>
                    </nav>
                </div>
            </header>

            <div className="app-sheet">
                <main className="main">
                    {/* Hero: the promise, the buttons - and a peek at a list, as it looks inside */}
                    <section className="page-intro landing-hero" aria-labelledby="landing-title">
                        <div className="landing-hero-text">
                            <p className="landing-kicker">
                                <Sparkles size={16} aria-hidden="true" /> Önskelistor och gåvor - tillsammans
                            </p>
                            <h1 id="landing-title">Önska, reservera och överraska - utan att avslöja något.</h1>
                            <p className="landing-lede">
                                {APP_NAME} samlar familjens och vännernas önskelistor på ett ställe. Alla ser vad som
                                redan är fixat, så ingen köper samma sak två gånger. Och den som listan är till ser
                                ingenting förrän paketet öppnas.
                            </p>
                            <div className="landing-cta">
                                <Link to="/register" className="btn btn-primary">
                                    Skapa konto <ArrowRight size={16} aria-hidden="true" />
                                </Link>
                                <Link to="/login" className="btn btn-ghost">
                                    Jag har redan ett konto
                                </Link>
                            </div>
                        </div>

                        <ListPreview />
                    </section>

                    <section className="section landing-section" aria-labelledby="landing-features">
                        <h2 id="landing-features">Allt du behöver inför nästa kalas</h2>
                        <ul className="landing-features">
                            {FEATURES.map(({ icon: Icon, title, text }) => (
                                <li key={title} className="landing-feature">
                                    <span className="landing-feature-icon" aria-hidden="true">
                                        <Icon size={22} />
                                    </span>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="section landing-section" aria-labelledby="landing-how">
                        <h2 id="landing-how">Så funkar det</h2>
                        <ol className="landing-steps">
                            {STEPS.map((step, i) => (
                                <li key={step.title} className="landing-step">
                                    <span className="landing-step-number" aria-hidden="true">
                                        {i + 1}
                                    </span>
                                    <h3>{step.title}</h3>
                                    <p>{step.text}</p>
                                </li>
                            ))}
                        </ol>
                    </section>

                    {/* Last: one more nudge, on the rose */}
                    <section className="landing-final" aria-labelledby="landing-final-title">
                        <Gift size={32} aria-hidden="true" className="landing-final-icon" />
                        <h2 id="landing-final-title">Nästa present börjar med en önskelista</h2>
                        <p>Inga annonser, och vi säljer aldrig dina uppgifter.</p>
                        <div className="landing-cta">
                            <Link to="/register" className="btn btn-primary">
                                Kom igång <ArrowRight size={16} aria-hidden="true" />
                            </Link>
                        </div>
                    </section>
                </main>
            </div>

            <Footer />
        </div>
    );
}

// A made-up list in the app's own look: a coloured panel and a few wish rows, some reserved
function ListPreview() {
    const wishes = [
        { title: "Lego Creator Trädkoja", price: "599 kr", reserved: true },
        { title: "Bok: Pippi Långstrump", price: "189 kr", reserved: false },
        { title: "Regnställ, storlek 110", price: "349 kr", reserved: true },
    ];
    return (
        <div className="landing-preview" aria-hidden="true">
            <div className="landing-preview-panel">
                <p className="landing-preview-kicker">
                    <ScrollText size={14} /> Önskelista
                </p>
                <p className="landing-preview-title">Sigrid fyller 5</p>
                <p className="landing-preview-meta">
                    <Heart size={14} /> 3 önskningar · <Check size={14} /> 2 reserverade
                </p>
            </div>
            <ul className="landing-preview-wishes">
                {wishes.map((wish) => (
                    <li key={wish.title} className={`landing-preview-wish${wish.reserved ? " is-reserved" : ""}`}>
                        <span className="landing-preview-image">
                            <Gift size={20} />
                        </span>
                        <span className="landing-preview-text">
                            <span className="landing-preview-wish-title">{wish.title}</span>
                            <span className="landing-preview-price">{wish.price}</span>
                        </span>
                        {wish.reserved ? (
                            <span className="badge badge-gift">Reserverad</span>
                        ) : (
                            <span className="landing-preview-reserve">
                                <CirclePlus size={14} /> Reservera
                            </span>
                        )}
                    </li>
                ))}
            </ul>
            <p className="landing-preview-share">
                <Link2 size={14} /> Dela listan med en länk
            </p>
        </div>
    );
}

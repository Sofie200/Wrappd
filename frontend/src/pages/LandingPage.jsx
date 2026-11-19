import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    Baby,
    ChartColumn,
    CirclePlus,
    EyeOff,
    HatGlasses,
    KeyRound,
    PartyPopper,
    Rocket,
    ScrollText,
    Sparkles,
    Users,
} from "lucide-react";
import Footer from "../components/Footer.jsx";
import Avatar from "../components/Avatar.jsx";
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
        text: "Lotta vem som ger till vem. Bara du ser vem du fick och du kan reservera en önskning direkt från hens profil.",
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
    { title: "Skapa ett konto", text: "Med Google eller e-post, det tar under en minut!" },
    { title: "Samla din grupp", text: "Bjud in familjen eller vännerna." },
    { title: "Önska och dela", text: "Gör en lista, dela den och låt nära och kära sköta resten." },
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
                        <Link to="/login" className="btn btn-small btn-ghost landing-login">
                            <KeyRound size={16} aria-hidden="true" /> Logga in
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
                            <h1 id="landing-title">Önska, reservera och överraska - utan att avslöja något</h1>
                            <p className="landing-lede">
                                {APP_NAME} samlar familjens och vännernas önskelistor på ett ställe. Alla kan se vad som
                                redan är taget, så det blir inga dubbletter - och den som ska få gåvorna ser ingenting
                                förrän paketen öppnas.
                            </p>
                            <div className="landing-cta">
                                <Link to="/register" className="btn btn-primary">
                                    Skapa konto <ArrowRight size={16} aria-hidden="true" />
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

                    <section className="section landing-section landing-how" aria-labelledby="landing-how">
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
                        <PartyPopper size={32} aria-hidden="true" className="landing-final-icon" />
                        <h2 id="landing-final-title">Förbered nästa firande med en önskelista</h2>
                        <p>Inga annonser, och vi säljer aldrig dina uppgifter.</p>
                        <div className="landing-cta">
                            <Link to="/register" className="btn btn-primary">
                                Kom igång <Rocket size={16} aria-hidden="true" />
                            </Link>
                        </div>
                    </section>
                </main>
            </div>

            <Footer />
        </div>
    );
}

// A made-up list, built from the list page's own parts (the same classes as there): the title and
// the date on the intro band (in the wish-list cards' peach-to-pink gradient), then a price group with wish rows - reserved ones toned down with the
// "Reserverad" badge and avatars, a free one with "Reservera". Not interactive - just a picture.
function ListPreview() {
    const wishes = [
        { title: "Lego Creator Trädkoja", price: "199 kr", reservedBy: [{ icon: "squirrel", color: "orange" }] },
        { title: "Bok: Pippi Långstrump", price: "189 kr" },
        {
            title: "Regnställ, storlek 110",
            price: "249 kr",
            reservedBy: [
                { icon: "bird", color: "blue" },
                { icon: "sun", color: "green" },
            ],
        },
    ];
    return (
        <div className="landing-preview" aria-hidden="true">
            <div className="landing-preview-head">
                <p className="landing-preview-title">Sigrid fyller 5</p>
                <p className="list-date">
                    24 maj 2027 <span className="muted">· om 6 månader</span>
                </p>
            </div>
            <div className="landing-preview-body">
                <p className="subhead">
                    Upp till 250 kr <span className="muted small">(3)</span>
                </p>
                <div className="wishes">
                    {wishes.map((wish) => (
                        <div key={wish.title} className={`wish-row${wish.reservedBy ? "" : " has-quick"}`}>
                            <div className={`wish wish-static${wish.reservedBy ? " wish-full" : ""}`}>
                                <img className="wish-image wish-image-empty" src="/gift-placeholder.png" alt="" />
                                <span className="wish-summary">
                                    <span className="wish-title">{wish.title}</span>
                                    <span className="wish-meta">
                                        <span className="price">{wish.price}</span>
                                    </span>
                                </span>
                                {wish.reservedBy && (
                                    <span className="wish-reserved">
                                        <span className="reserved-by">
                                            <span className="badge badge-gift">Reserverad</span>
                                            <span className="avatar-stack">
                                                {wish.reservedBy.map((p, i) => (
                                                    <Avatar key={i} icon={p.icon} color={p.color} size={22} />
                                                ))}
                                            </span>
                                        </span>
                                    </span>
                                )}
                            </div>
                            {!wish.reservedBy && (
                                <span className="btn btn-small btn-primary wish-quick-reserve">
                                    <CirclePlus size={16} /> Reservera
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

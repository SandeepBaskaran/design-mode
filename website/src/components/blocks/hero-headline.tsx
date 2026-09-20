import styles from "./hero-headline.module.css";

const agents = [
  { name: "Claude", logo: "claude", colour: "#D97757" },
  { name: "OpenAI", logo: "openai", colour: "#10A37F" },
  { name: "Gemini", logo: "gemini-color" },
  { name: "Perplexity", logo: "perplexity", colour: "#20808D" },
  { name: "Cursor", logo: "cursor", colour: "#26241E" },
  { name: "Windsurf", logo: "windsurf", colour: "#07847D" },
  { name: "Antigravity", logo: "antigravity-color" },
];

export function HeroHeadline() {
  return (
    <div className={styles.headline}>
      <h1 className="macro text-foreground">
        <span className={styles.line}>The visual editor for</span>{" "}
        <span className={styles.line}>
          all your{" "}
          <span className={styles.logos} aria-hidden="true">
            {agents.map((agent, index) => (
              <span
                key={agent.logo}
                className={styles.logo}
                style={{ animationDelay: `${index * 0.6}s` }}
              >
                <span
                  className={styles.mark}
                  style={
                    agent.colour
                      ? {
                          backgroundColor: agent.colour,
                          maskImage: `url(/logos/icons/${agent.logo}.svg)`,
                          maskSize: "contain",
                          maskRepeat: "no-repeat",
                          maskPosition: "center",
                        }
                      : {
                          backgroundImage: `url(/logos/icons/${agent.logo}.svg)`,
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                        }
                  }
                />
              </span>
            ))}
          </span>{" "}
          agent&apos;s work
        </span>
      </h1>
    </div>
  );
}

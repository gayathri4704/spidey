/**
 * Spidey – Powers Page
 * Displays Spidey's abilities and a stats bar
 */

import PowerCard from '../components/PowerCard';
import SectionHeader from '../components/SectionHeader';

const POWERS = [
  {
    icon: '🕸️',
    title: 'Web Slinging',
    description: 'Fires strong adhesive webs from wrist-mounted shooters, allowing swift traversal across the city skyline at breathtaking speed.',
  },
  {
    icon: '🕷️',
    title: 'Spider-Sense',
    description: 'A precognitive awareness that warns of imminent danger, reacting faster than any human reflex could possibly allow.',
  },
  {
    icon: '💪',
    title: 'Super Strength',
    description: 'Can lift objects many times his own body weight, stop speeding vehicles, and endure tremendous physical punishment.',
  },
  {
    icon: '🧗',
    title: 'Wall Crawling',
    description: 'Microscopic hairs on hands and feet allow adhesion to any surface — glass, metal, or stone — at any angle.',
  },
  {
    icon: '⚡',
    title: 'Agility & Speed',
    description: 'Superhuman reflexes and agility beyond Olympic-level athletes, capable of dodging bullets and acrobatic mid-air manoeuvres.',
  },
  {
    icon: '🧬',
    title: 'Accelerated Healing',
    description: 'Enhanced cellular regeneration that heals wounds and injuries far more rapidly than normal, keeping him in the fight.',
  },
];

const STATS = [
  { value: '10×',    label: 'Strength Multiplier' },
  { value: '700+',   label: 'Villains Defeated'   },
  { value: '12 yrs', label: 'Crime Fighting'      },
  { value: '∞',      label: 'Responsibility'      },
];

export default function PowersPage() {
  return (
    <>
      {/* Stats bar */}
      <div className="stats-bar">
        <div className="container">
          <div className="stats-bar__grid">
            {STATS.map(({ value, label }) => (
              <div className="stats-bar__item" key={label}>
                <div className="stats-bar__value">{value}</div>
                <div className="stats-bar__label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Powers section */}
      <section id="powers" className="section web-pattern" aria-labelledby="powers-heading">
        <div className="container">
          <SectionHeader
            tag="🕷️ Abilities"
            title="AMAZING POWERS"
            description="Gifted by the bite of a radioactive spider, each ability merges science with something truly extraordinary."
          />

          <div className="powers-grid" id="powers-heading">
            {POWERS.map((power, i) => (
              <PowerCard
                key={power.title}
                icon={power.icon}
                title={power.title}
                description={power.description}
                delay={Math.min(i + 1, 5)}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

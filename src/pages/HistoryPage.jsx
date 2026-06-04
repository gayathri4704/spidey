/**
 * Spidey – History Page
 * Origin story presented as a visual timeline
 */

import SectionHeader from '../components/SectionHeader';
import { formatDate } from '../utils/helpers';

const TIMELINE = [
  {
    date: 'The Beginning',
    title: 'A Fateful Field Trip',
    description:
      'During a school excursion to Oscorp Industries, a genetically engineered spider escaped containment and bit a quiet, bookish student. Nothing would ever be the same.',
    tag: 'Origin',
    tagType: 'red',
  },
  {
    date: 'Days Later',
    title: 'The Power Awakens',
    description:
      'Extraordinary strength, wall-crawling, and a buzzing sixth sense — all manifestations of the spider\'s DNA merging with human biology. The Spider-Sense would prove to be his most vital gift.',
    tag: 'Transformation',
    tagType: 'blue',
  },
  {
    date: 'A Tragic Night',
    title: 'Great Responsibility',
    description:
      'A moment of inaction — allowing a thief to flee — led to a devastating consequence. The lesson: with great power must come great responsibility. This became the hero\'s guiding code.',
    tag: 'Turning Point',
    tagType: 'red',
  },
  {
    date: 'First Patrol',
    title: 'Swinging Into Action',
    description:
      'Donning a hand-made suit and crafting web-shooters from scratch, the city gained its most unlikely defender — a teenager balancing homework and heroism.',
    tag: 'Hero Born',
    tagType: 'blue',
  },
  {
    date: 'Present Day',
    title: 'Guardian of the City',
    description:
      'Years of experience have refined the hero. Rogues\' gallery of villains defeated, countless lives saved, and a reputation as the most beloved street-level hero the world has ever known.',
    tag: 'Legacy',
    tagType: 'red',
  },
];

export default function HistoryPage() {
  return (
    <section id="history" className="section" aria-labelledby="history-heading">
      <div className="container">
        <SectionHeader
          tag="📖 Origin"
          title="THE ORIGIN STORY"
          description="From an ordinary student to an extraordinary hero — a journey defined by science, tragedy, and unwavering responsibility."
        />

        <div style={{ maxWidth: '700px', marginInline: 'auto' }}>
          <div className="timeline" id="history-heading" role="list">
            {TIMELINE.map(({ date, title, description, tag, tagType }) => (
              <div className="timeline__item" key={title} role="listitem">
                <div className="timeline__date">{date}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                  <h3 className="timeline__title">{title}</h3>
                  <span className={`badge badge-${tagType}`}>{tag}</span>
                </div>
                <p className="timeline__desc">{description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quote */}
        <div
          style={{
            textAlign: 'center',
            marginTop: 'var(--space-3xl)',
            padding: 'var(--space-xl)',
            background: 'linear-gradient(135deg, rgba(192,57,43,0.06), rgba(37,99,235,0.06))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <blockquote
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
              letterSpacing: '0.03em',
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            <span className="text-gradient-red">"WITH GREAT POWER</span>
            <br />
            COMES GREAT
            <br />
            <span className="text-gradient-blue">RESPONSIBILITY."</span>
          </blockquote>
          <p style={{ marginTop: 'var(--space-md)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            — Ben Parker
          </p>
        </div>
      </div>
    </section>
  );
}

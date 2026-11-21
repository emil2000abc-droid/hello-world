import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { StarField, Marquee, ScrollProgress } from './components/Ambient';
import { DataSection } from './components/DataTable';
import { ExplorationSection } from './components/Exploration';
import { FactsSection } from './components/Facts';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { PlanetModal } from './components/PlanetModal';
import { PlanetsSection } from './components/Planets';
import { SunSection } from './components/Sun';
import { renderPortraits } from './three/portraits';

export function App() {
  // Card renders are made after the hero has settled, one planet per frame.
  useEffect(() => {
    const t = window.setTimeout(renderPortraits, 1200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <StarField />
      <ScrollProgress />
      <Header />
      <main>
        <Hero />
        <Marquee />
        <PlanetsSection />
        <SunSection />
        <DataSection />
        <ExplorationSection />
        <FactsSection />
      </main>
      <Footer />
      <PlanetModal />
    </MotionConfig>
  );
}

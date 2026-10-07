<script setup>
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import HeroSection from '@/components/marketing/HeroSection.vue'
import ProblemSection from '@/components/marketing/ProblemSection.vue'
import SectorsSection from '@/components/marketing/SectorsSection.vue'
import HowSection from '@/components/marketing/HowSection.vue'
import CalculatorSection from '@/components/marketing/CalculatorSection.vue'
import PricingSection from '@/components/marketing/PricingSection.vue'
import FaqSection from '@/components/marketing/FaqSection.vue'
import FinalCta from '@/components/marketing/FinalCta.vue'

/**
 * Written for the owner of a service business, in the order they decide:
 * what it does (hero) → is this my problem (problem) → is it for my kind of
 * business (sectors) → how hard is it (how) → is it worth it (calculator) →
 * what does it cost (pricing) → my remaining doubts (faq) → start.
 * Backgrounds alternate surface / canvas so each section reads as its own.
 */
</script>

<template>
  <div class="bg-canvas min-h-screen">
    <AppNavbar />

    <main>
      <HeroSection />
      <ProblemSection />
      <SectorsSection />
      <HowSection />
      <CalculatorSection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </main>

    <AppFooter />
  </div>
</template>

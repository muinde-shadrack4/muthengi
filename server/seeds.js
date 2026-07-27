const DEFAULT_CONTENT = {
  brand: {
    name: 'Muthengi Building & Construction Engineers',
    shortName: 'Muthengi',
    logo: '/assets/img/logo.png',
  },
  nav: {
    ctaText: 'Get a Quote',
  },
  hero: {
    eyebrow: 'Structural Precision Since Site One',
    headingLine1: 'Built to Spec.',
    headingLine2: 'Built to Last.',
    subtext:
      'Muthengi Building & Construction Engineers delivers residential, commercial and civil works across Kenya — from foundation drawings to final handover, engineered right the first time.',
    ctaPrimaryText: 'Request a Quote',
    ctaSecondaryText: 'Our Capabilities',
    heroImage: '/assets/img/hero-placeholder.jpg',
    // Add real job-site photo URLs here from the admin dashboard and the hero background
    // will slowly cross-fade between them (Ken Burns style). Leave empty for the plain
    // blueprint-grid background.
    backgroundImages: [],
  },
  stats: [
    { value: '12+', label: 'Years on Site' },
    { value: '80+', label: 'Projects Delivered' },
    { value: '100%', label: 'NCA Compliant' },
  ],
  servicesIntro: {
    eyebrow: 'What We Build',
    heading: 'Every Scale, One Standard of Precision',
    subtext:
      'From a single residential slab to multi-phase commercial developments, our engineers hold every project to the same tolerance for error: none.',
  },
  services: [
    {
      tag: 'Residential',
      title: 'Custom Home Construction',
      description: 'Design-to-handover builds for private clients, with structural drawings, BQs and site supervision in-house.',
    },
    {
      tag: 'Commercial',
      title: 'Commercial Development',
      description: 'Retail, office and mixed-use structures engineered for load, code compliance, and long-term maintenance cost.',
    },
    {
      tag: 'Civil Works',
      title: 'Civil & Infrastructure',
      description: 'Access roads, drainage, retaining structures and site works that hold up through Kenya\u2019s rainy seasons.',
    },
  ],
  portfolioIntro: {
    eyebrow: 'The Site Record',
    heading: 'Recent Work',
  },
  gallery: [
    { image: '/assets/img/project-placeholder-1.jpg', caption: 'Residential build, Machakos County' },
    { image: '/assets/img/project-placeholder-2.jpg', caption: 'Commercial fit-out, Nairobi' },
    { image: '/assets/img/project-placeholder-3.jpg', caption: 'Retaining wall & site works' },
  ],
  testimonial: {
    quote:
      'Muthengi\u2019s team caught a drainage issue on our site plan before we broke ground — saved us a rework that would have cost months.',
    author: 'A recent client',
    role: 'Private residential build',
  },
  about: {
    eyebrow: 'Who We Are',
    heading: 'Engineers First, Builders Always',
    intro:
      'Muthengi Building & Construction Engineers was founded on a simple idea: a building is only as good as the drawings and the discipline behind it. We hold every job — from a single residential slab to a multi-phase commercial site — to the same standard.',
    storyHeading: 'Our Story',
    story:
      'We started on small residential jobs around Nairobi and Machakos, and grew by doing unglamorous things well: accurate BQs, honest timelines, and site supervision that actually catches problems before they\u2019re poured in concrete. That reputation is what still brings us most of our work today.',
    missionHeading: 'How We Work',
    mission:
      'Every project gets structural drawings, a bill of quantities, and a named site engineer before ground is broken. We report progress plainly, flag issues early, and stand behind the work after handover.',
    values: [
      { title: 'Engineered, Not Guessed', description: 'Every structural decision is backed by calculation and code, not habit.' },
      { title: 'Say It Straight', description: 'Clients hear about delays, cost changes, or site issues the day we know about them, not after.' },
      { title: 'On Site, Not Just On Paper', description: 'Our engineers walk the site through every phase, not just at handover.' },
    ],
    photo: '/assets/img/about-placeholder.jpg',
  },
  contact: {
    phone: '+254 7XX XXX XXX',
    email: 'info@muthengibce.co.ke',
    address: 'Nairobi, Kenya',
    formIntro: 'Tell us about your site and we\u2019ll come back with a scope and estimate.',
  },
  footer: {
    blurb: 'Licensed building and construction engineers serving Nairobi and beyond.',
  },
};

const DEFAULT_REVIEWS = {
  manual: [],
};

const DEFAULT_SETTINGS = {
  googlePlaceId: '',
  googleApiKey: '',
  siteMessage: '',
};

module.exports = { DEFAULT_CONTENT, DEFAULT_REVIEWS, DEFAULT_SETTINGS };

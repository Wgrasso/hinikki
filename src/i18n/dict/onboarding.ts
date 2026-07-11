// src/i18n/dict/onboarding.ts — onboarding UI strings (en + nl). Filled during screen conversion.
// Dutch uses the polite "u" register throughout — the audience is older adults + family.
export const onboarding = {
  en: {
    // mode-selection
    "onboarding.mode.welcome": "WELCOME TO HINIKKI",
    "onboarding.mode.title": "Who are you\nsetting up Nikki for?",
    "onboarding.mode.user.title": "I am using Nikki",
    "onboarding.mode.user.subtitle": "Set up Nikki for yourself.",
    "onboarding.mode.family.title": "I am family / caregiver",
    "onboarding.mode.family.subtitle": "Help set up and look after someone.",
    // user-pairing
    "onboarding.pairing.title": "Connect with your family",
    "onboarding.pairing.introTitle": "Enter the code your family gave you",
    "onboarding.pairing.introBody": "Your family already set things up for you.",
    "onboarding.pairing.codeLabel": "Code from family",
    "onboarding.pairing.codePlaceholder": "8-character code",
    "onboarding.pairing.continue": "Continue",
    "onboarding.pairing.pickName": "Tap your name to connect.",
    "onboarding.pairing.onAnotherDevice": "On another device — tap to move it to this phone",
    "onboarding.pairing.moveTitle": "Use Nikki as {name} on this phone?",
    "onboarding.pairing.moveBody": "This name is set up on another device. Moving it here will disconnect that other device.",
    "onboarding.pairing.moveConfirm": "Move to this phone",
    "onboarding.pairing.alreadyOther": "This phone is already connected as someone else. Ask your family for help, or start fresh from the app settings.",
  } as Record<string, string>,
  nl: {
    // mode-selection
    "onboarding.mode.welcome": "WELKOM BIJ HINIKKI",
    "onboarding.mode.title": "Voor wie stelt u\nNikki in?",
    "onboarding.mode.user.title": "Ik ga Nikki gebruiken",
    "onboarding.mode.user.subtitle": "Stel Nikki in voor uzelf.",
    "onboarding.mode.family.title": "Ik ben familie / verzorger",
    "onboarding.mode.family.subtitle": "Help iemand met instellen en houd een oogje in het zeil.",
    // user-pairing
    "onboarding.pairing.title": "Verbind met uw familie",
    "onboarding.pairing.introTitle": "Voer de code in die uw familie u gaf",
    "onboarding.pairing.introBody": "Uw familie heeft alles al voor u klaargezet.",
    "onboarding.pairing.codeLabel": "Code van uw familie",
    "onboarding.pairing.codePlaceholder": "Code van 8 tekens",
    "onboarding.pairing.continue": "Verder",
    "onboarding.pairing.pickName": "Tik op uw naam om te verbinden.",
    "onboarding.pairing.onAnotherDevice": "Op een ander apparaat — tik om het naar deze telefoon te halen",
    "onboarding.pairing.moveTitle": "Nikki als {name} op deze telefoon gebruiken?",
    "onboarding.pairing.moveBody": "Deze naam staat op een ander apparaat. Als u die hierheen haalt, wordt het andere apparaat losgekoppeld.",
    "onboarding.pairing.moveConfirm": "Naar deze telefoon halen",
    "onboarding.pairing.alreadyOther": "Deze telefoon is al verbonden als iemand anders. Vraag uw familie om hulp, of begin opnieuw via de instellingen.",
  } as Record<string, string>,
} as const;

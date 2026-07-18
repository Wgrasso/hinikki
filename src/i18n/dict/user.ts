// src/i18n/dict/user.ts — user (older-adult facing) UI strings (en + nl).
// Keys are dot-namespaced; {name}-style placeholders are filled by t(key, { name }).
// Dutch uses the warm, polite "u" register throughout (older adults + family).
export const user = {
  en: {
    // Nikki home
    "nikki.intro.named": "{greeting}, {name}.",
    "nikki.intro.plain": "{greeting}.",
    "nikki.eventAt": "Today at {time}: {summary}.",
    "nikki.calmDay": "You have a calm, open day today.",
    "nikki.wakingUp": "Waking Nikki up…",
    "nikki.openWeather": "See the weather in {city}",

    // People
    "people.title": "My people",
    "people.loading": "Finding your family…",
    "people.emptyTitle": "No family added yet",
    "people.emptySubtitle":
      "Your family can add familiar faces here, and then I can tell you all about them.",
    "people.yourRelationship": "Your {relationship}",
    "people.lives": "lives {location}",
    "people.askNikkiAbout": "Ask Nikki about {name}",
    "people.close": "Close",
    "people.whoIs": "Who is {name}?",

    // Help
    "help.subtitle": "Tap any button. I am here to help.",
    "help.loading": "Getting help ready…",
    "help.lost.label": "I am lost",
    "help.lost.desc": "I will show you the way home.",
    "help.lost.noHome": "Your family needs to add your home address first.",
    "help.call.label": "Call family",
    "help.call.desc": "Phone someone who can help.",
    "help.emergency.label": "Emergency",
    "help.emergency.desc": "Call family right away and share where you are.",
    "help.noPhone": "Your family needs to add a phone number first.",
    "help.noPhoneSaved":
      "There is no family phone number saved yet. Your family can add one for you.",
    "help.calling": "Calling {name}…",
    "help.callFailed": "I could not start the call. Please try again.",
    "help.openingMap": "Opening the map to guide you home…",
    "help.mapFailed": "I could not open the map. Please try again.",
    "help.startOver.link": "Start over on this phone",
    "help.startOver.title": "Start over?",
    "help.startOver.body":
      "This phone will be disconnected from your family. You will need your family code to set it up again.",
    "help.startOver.confirm": "Start over",

    // Voice experience
    "voice.notSetUp":
      "Nikki's voice is not set up on this app yet. Your family can finish the setup, and then you can simply talk to me.",
    "voice.webOnly":
      "Talking with Nikki works in the HiNikki phone app. On this screen you can still see your day and your people.",
    "voice.idleNamed":
      "I am Nikki, and I am here for you, {name}. Tap the big button and just talk to me — about your day, your family, or the weather.",
    "voice.idlePlain":
      "I am Nikki, and I am here for you. Tap the big button and just talk to me — about your day, your family, or the weather.",
    "voice.ended":
      "It was lovely talking with you. Tap the button whenever you would like to talk again.",
    "voice.speaking": "Nikki is speaking…",
    "voice.listening": "Nikki is listening — just talk",
    "voice.hearing": "Nikki hears you",
    "voice.wrappingUp": "Saying goodbye…",
    "voice.goodbye": "Goodbye Nikki",
    "voice.talk": "Talk to Nikki",

    // Captions
    "caption.you": "YOU",
    "caption.nikki": "NIKKI",
    "caption.avatarLabel": "someone in your family",

    // Recap
    "recap.title": "Our chat today",
    "recap.proposed": "I made a note for your family: {label}",
    "recap.confirmed": "You took care of: {label}",
    "recap.called": "We {label}",
    "recap.help": "I let your family know you wanted a hand",
  } as Record<string, string>,
  nl: {
    // Nikki home
    "nikki.intro.named": "{greeting}, {name}.",
    "nikki.intro.plain": "{greeting}.",
    "nikki.eventAt": "Vandaag om {time}: {summary}.",
    "nikki.calmDay": "U heeft vandaag een rustige, vrije dag.",
    "nikki.wakingUp": "Nikki wordt wakker…",
    "nikki.openWeather": "Bekijk het weer in {city}",

    // People
    "people.title": "Mijn mensen",
    "people.loading": "Uw familie zoeken…",
    "people.emptyTitle": "Nog geen familie toegevoegd",
    "people.emptySubtitle":
      "Uw familie kan hier bekende gezichten toevoegen, dan kan ik u alles over hen vertellen.",
    "people.yourRelationship": "Uw {relationship}",
    "people.lives": "woont {location}",
    "people.askNikkiAbout": "Vraag Nikki over {name}",
    "people.close": "Sluiten",
    "people.whoIs": "Wie is {name}?",

    // Help
    "help.subtitle": "Tik op een knop. Ik help u graag.",
    "help.loading": "Hulp klaarzetten…",
    "help.lost.label": "Ik ben de weg kwijt",
    "help.lost.desc": "Ik wijs u de weg naar huis.",
    "help.lost.noHome": "Uw familie moet eerst uw thuisadres toevoegen.",
    "help.call.label": "Familie bellen",
    "help.call.desc": "Bel iemand die u kan helpen.",
    "help.emergency.label": "Noodgeval",
    "help.emergency.desc": "Bel meteen uw familie en laat weten waar u bent.",
    "help.noPhone": "Uw familie moet eerst een telefoonnummer toevoegen.",
    "help.noPhoneSaved":
      "Er is nog geen telefoonnummer van de familie opgeslagen. Uw familie kan er een voor u toevoegen.",
    "help.calling": "{name} bellen…",
    "help.callFailed": "Ik kon het gesprek niet starten. Probeer het opnieuw.",
    "help.openingMap": "De kaart wordt geopend om u naar huis te begeleiden…",
    "help.mapFailed": "Ik kon de kaart niet openen. Probeer het opnieuw.",
    "help.startOver.link": "Opnieuw beginnen op deze telefoon",
    "help.startOver.title": "Opnieuw beginnen?",
    "help.startOver.body":
      "Deze telefoon wordt losgekoppeld van uw familie. U heeft de familiecode nodig om hem opnieuw in te stellen.",
    "help.startOver.confirm": "Opnieuw beginnen",

    // Voice experience
    "voice.notSetUp":
      "Nikki's stem is nog niet ingesteld in deze app. Uw familie kan dit afronden, daarna kunt u gewoon met mij praten.",
    "voice.webOnly":
      "Praten met Nikki kan in de HiNikki-telefoonapp. Op dit scherm ziet u nog steeds uw dag en uw mensen.",
    "voice.idleNamed":
      "Ik ben Nikki en ik ben er voor u, {name}. Tik op de grote knop en praat gewoon met mij — over uw dag, uw familie of het weer.",
    "voice.idlePlain":
      "Ik ben Nikki en ik ben er voor u. Tik op de grote knop en praat gewoon met mij — over uw dag, uw familie of het weer.",
    "voice.ended":
      "Het was fijn om met u te praten. Tik op de knop wanneer u weer wilt praten.",
    "voice.speaking": "Nikki praat…",
    "voice.listening": "Nikki luistert — praat gewoon",
    "voice.hearing": "Nikki hoort u",
    "voice.wrappingUp": "Even afronden…",
    "voice.goodbye": "Dag Nikki",
    "voice.talk": "Praat met Nikki",

    // Captions
    "caption.you": "U",
    "caption.nikki": "NIKKI",
    "caption.avatarLabel": "iemand uit uw familie",

    // Recap
    "recap.title": "Ons gesprek vandaag",
    "recap.proposed": "Ik heb een notitie voor uw familie gemaakt: {label}",
    "recap.confirmed": "U heeft geregeld: {label}",
    "recap.called": "We {label}",
    "recap.help": "Ik heb uw familie laten weten dat u hulp wilde",
  } as Record<string, string>,
} as const;

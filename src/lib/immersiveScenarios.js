// Practice cues are fictional role-play details, not real bookings or policies.
const cue = (id, title, detail, phrase, position) => ({ id, title, detail, phrase, position });

export const IMMERSIVE_SCENARIOS = {
  bank: {
    name: 'First National', atmosphere: 'A new beginning · forest green & brushed brass', accent: '#b8dbbf', wall: '#537164', floor: '#b8b49a', light: '#e8f4d4',
    cues: [
      cue('rates', 'Compare accounts', 'Ask the teller to explain interest, minimum balances, and fees. These are fictional practice accounts.', 'How do your savings accounts compare in terms of interest and monthly fees?', [0, 2.4, -2.6]),
      cue('form', 'Open an account', 'You have recently moved and want to understand the application process.', 'I have just moved here. What do I need to open a savings account?', [-0.9, 1.4, -0.1]),
      cue('card', 'Check identification', 'Confirm the documents required before completing the application.', 'Would my passport and proof of address be sufficient?', [0.8, 1.4, 0]),
    ],
  },
  cafe: {
    name: 'Brew & Bean', atmosphere: 'A slow morning · warm oak & fresh coffee', accent: '#e8bb83', wall: '#526654', floor: '#b48a62', light: '#ffdaa3',
    cues: [
      cue('menu', 'Read the menu', 'Five colleagues. Different drinks. One person needs a dairy-free option.', 'Could I get five drinks, including one latte with oat milk?', [-0.85, 2.4, -2.6]),
      cue('coffee', 'Your coffee order', 'Check the milk choice and whether the drinks are to go.', 'Could you label the oat-milk latte and make all five to go?', [0.6, 1.45, -0.5]),
      cue('pastry', 'Choose pastries', 'Ask what is available and check ingredients before ordering for the group.', 'Which pastries are dairy-free, and could you pack them separately?', [1.95, 1.4, -0.5]),
    ],
  },
  airport: {
    name: 'Terminal 02', atmosphere: 'Before departure · glass, steel & open skies', accent: '#95d4ed', wall: '#49636e', floor: '#a6b3b6', light: '#d5eeff',
    cues: [
      cue('board', 'Check departures', 'Practice flight BA123 to New York is delayed. The display shows 16:40 at gate B12.', 'Is 16:40 the confirmed departure time for BA123?', [0.1, 2.4, -2.6]),
      cue('passport', 'Ask about connections', 'Have your travel details ready and explain why your connection matters.', 'If I miss my connection, could you rebook me on the next available flight?', [-0.7, 1.38, -0.2]),
      cue('luggage', 'Check your baggage', 'Find out what happens to checked bags if your itinerary changes.', 'Will my checked baggage be transferred to the new flight?', [2.1, 0.95, 1]),
    ],
  },
  hotel: {
    name: 'The Grand Hotel', atmosphere: 'Evening arrival · brass, marble & amber light', accent: '#ebc68b', wall: '#4c5551', floor: '#c9bba4', light: '#ffd59b',
    cues: [
      cue('bell', 'Call the receptionist', 'You have lost your room key. Start with a polite request for help.', 'Excuse me, I seem to have lost my room key. Could you help?', [-1, 1.45, -0.2]),
      cue('key', 'Replace your key', 'The receptionist needs to verify your name and room number.', 'I am in room 204. What identification do you need for a replacement?', [0.8, 1.4, -0.2]),
      cue('clock', 'Confirm checkout', 'For this practice stay, the displayed checkout time is 11:00.', 'Could you confirm the checkout time, and is late checkout available?', [0, 2.5, -2.6]),
    ],
  },
  restaurant: {
    name: 'Bella Italia', atmosphere: 'Dinner for two · terracotta & candlelight', accent: '#efb5a0', wall: '#79534b', floor: '#ae8871', light: '#ffd39b',
    cues: [
      cue('menu', 'Explore the menu', 'Tell the waiter about your nut allergy before choosing your meal.', 'I have a severe nut allergy. Could you check which dishes would be suitable?', [-0.7, 1.35, 0.5]),
      cue('plate', 'Check ingredients', 'A menu alone cannot confirm allergy safety. Ask the waiter to check with the kitchen.', 'Could you ask the chef about the ingredients and cross-contact with nuts?', [0.5, 1.3, 0.6]),
      cue('wine', 'Choose a drink', 'Ask for a recommendation and clarify the size before ordering.', 'What wine would you recommend by the glass?', [1.1, 1.65, -0.1]),
    ],
  },
  shopping: {
    name: 'TechMart', atmosphere: 'A fresh start · lilac displays & brushed metal', accent: '#d1b6ec', wall: '#686078', floor: '#b9b1c3', light: '#e5e2ff',
    cues: [
      cue('laptop', 'Show the defect', 'You bought this laptop last week. Explain the problem with its display.', 'The screen flickers whenever I open an application. I bought it last week.', [-0.7, 1.55, 0]),
      cue('receipt', 'Find your receipt', 'Your proof of purchase helps the associate check the return options.', 'Here is my receipt. Am I eligible for a refund or an exchange?', [0.7, 1.36, 0.2]),
      cue('exchange', 'Compare alternatives', 'Decide whether you would prefer a replacement or a refund.', 'Could I exchange it for the same model, and would the warranty restart?', [1.5, 2, -2.3]),
    ],
  },
  hospital: {
    name: 'The consultation room', atmosphere: 'A quiet appointment · soft teal & daylight', accent: '#a5dbd4', wall: '#65827f', floor: '#c4cfca', light: '#e1fff7',
    cues: [
      cue('notes', 'Describe symptoms', 'Your role-play symptoms: headaches for two weeks, worse in the morning, sometimes with dizziness.', 'I have had headaches for two weeks, mostly in the morning.', [-0.7, 1.35, 0.1]),
      cue('chart', 'Give more detail', 'Explain when the headaches happen, how long they last, and how they affect you.', 'They usually last about an hour, and sometimes I also feel dizzy.', [0, 2.3, -2.6]),
      cue('plan', 'Ask about next steps', 'Practise checking that you understood the doctor’s explanation.', 'Could you explain the next steps and when I should come back?', [1.05, 1.35, 0.1]),
    ],
  },
  university: {
    name: 'The advising studio', atmosphere: 'A new semester · books, sunlight & possibilities', accent: '#c9bce9', wall: '#63667f', floor: '#b5a38a', light: '#fff0cf',
    cues: [
      cue('plan', 'Plan your semester', 'You are a sophomore choosing courses for next semester.', 'Which courses do I need to take next semester for my major?', [-0.75, 1.4, 0]),
      cue('books', 'Explore electives', 'Ask how electives fit your interests and course requirements.', 'I am interested in design. Could an elective count toward my degree?', [-2.25, 1.95, -2.15]),
      cue('calendar', 'Check your schedule', 'Look for prerequisites and timetable conflicts before registering.', 'Does this course have a prerequisite, and does it clash with my required class?', [0.8, 2.3, -2.6]),
    ],
  },
  office: {
    name: 'The corner office', atmosphere: 'A moment to talk · sage green & city light', accent: '#c3d5ab', wall: '#596b59', floor: '#b5a28a', light: '#f5e9c7',
    cues: [
      cue('calendar', 'Choose your dates', 'You want to take two weeks off next month for a family trip.', 'I would like to request two weeks off next month for a family trip.', [0.8, 2.3, -2.6]),
      cue('laptop', 'Discuss coverage', 'Make a clear plan for ongoing work while you are away.', 'I can finish the report before I leave and brief a colleague on the remaining tasks.', [-0.75, 1.6, 0]),
      cue('handover', 'Agree on a handover', 'Confirm who will cover your responsibilities and what approval is needed.', 'Would a written handover and a coverage plan be enough to approve the leave?', [1.1, 1.4, 0.2]),
    ],
  },
  phone: {
    name: 'A call from home', atmosphere: 'Rainy afternoon · blue shadows & a desk lamp', accent: '#afc7ea', wall: '#4c5e79', floor: '#aa967e', light: '#d5e3ff',
    cues: [
      cue('phone', 'Start your call', 'Introduce yourself and state the reason for calling.', 'Hello, I am calling about a charge on my latest phone bill.', [-0.9, 1.5, 0.2]),
      cue('bill', 'Query the charge', 'This practice bill includes an unfamiliar extra charge of $50.', 'There is an extra fifty-dollar charge that I do not recognize. What is it for?', [0.1, 1.4, 0.2]),
      cue('notes', 'Confirm the resolution', 'Before ending the call, confirm the agreed action and timing.', 'Could you confirm when the charge will be removed and send me a reference number?', [1.05, 1.4, 0.1]),
    ],
  },
  car_rental: {
    name: 'The coastal departure', atmosphere: 'Ready for the road · sunlit concrete & sea blue', accent: '#ead29a', wall: '#527079', floor: '#a3aba6', light: '#ffedbe',
    cues: [
      cue('car', 'Choose your car', 'You need a comfortable car for a week-long coastal road trip.', 'Which car would you recommend for a week-long trip along the coast?', [-0.9, 1.4, 0.5]),
      cue('keys', 'Check the extras', 'Confirm navigation, mileage allowance, and the return time.', 'Does this car include GPS, and is the mileage unlimited?', [1.85, 1.3, -0.6]),
      cue('policy', 'Understand cover', 'Ask the rental agent to explain the insurance and any excess.', 'What does the insurance cover, and how much is the excess?', [1.65, 2.2, -2.6]),
    ],
  },
  museum: {
    name: 'The light gallery', atmosphere: 'An unhurried visit · limestone & pools of light', accent: '#e5d6b8', wall: '#b5ada0', floor: '#d1c4af', light: '#fff0d2',
    cues: [
      cue('painting', 'Notice the light', 'This illustrative study is a conversation starter about light and color, not a reproduction of a named artwork.', 'How did Impressionist painters use color to capture changing light?', [-1.75, 2.2, -2.6]),
      cue('sculpture', 'Look at the form', 'Compare the central sculpture’s shape with the paintings around it.', 'How does viewing a sculpture differ from looking at a painting?', [0, 1.65, 0.2]),
      cue('landscape', 'Ask your guide', 'Ask your guide to name three Impressionist works and explain their techniques.', 'Could you recommend three Impressionist paintings and explain their brushwork?', [1.65, 2.2, -2.6]),
    ],
  },
};

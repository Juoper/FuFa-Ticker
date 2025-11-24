import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding timetable entries...');

  // Check if entries already exist
  const existingEntries = await prisma.timetableEntry.count();
  if (existingEntries > 0) {
    console.log('Timetable entries already exist, skipping seed.');
    return;
  }

  // Friday entries
  await prisma.timetableEntry.createMany({
    data: [

        // Friday
        { day: 'friday', startTime: '17:00', endTime: '19:00', content: 'Ankunft Küche?' },
        { day: 'friday', startTime: '19:00', endTime: '20:00', content: 'Abendessen (flexibel)' },
        { day: 'friday', startTime: '20:00', endTime: '21:00', content: 'Vorbereitung Versprechen' },
        { day: 'friday', startTime: '21:00', endTime: '22:00', content: 'Sekani Ankunft + Essen' },
        { day: 'friday', startTime: '22:00', endTime: '24:00', content: 'Losschicken' },
        
        // Saturday
        { day: 'saturday', startTime: '02:00', endTime: '08:00', content: 'Versprechen (flexibel) / Danach Schlaf' },
        { day: 'saturday', startTime: '08:00', endTime: '08:20', content: 'Wecken' },
        { day: 'saturday', startTime: '08:20', endTime: '08:30', content: 'Morgenrunde' },
        { day: 'saturday', startTime: '08:30', endTime: '09:30', content: 'Frühstück' },
        { day: 'saturday', startTime: '09:30', endTime: '10:30', content: 'Finanzvortrag' },
        { day: 'saturday', startTime: '10:30', endTime: '11:30', content: 'Stafu-Wahl' },
        { day: 'saturday', startTime: '13:00', endTime: '14:30', content: 'Mittagessen' },
        { day: 'saturday', startTime: '14:30', endTime: '17:00', content: 'Postenverabschiedung / SB-/SV-Postenvergabe' },
        { day: 'saturday', startTime: '17:00', endTime: '19:00', content: 'Verteilung Jahresberichte / Jahresplanung I' },
        { day: 'saturday', startTime: '19:00', endTime: '20:00', content: 'Abendessen' },
        { day: 'saturday', startTime: '20:00', endTime: '21:00', content: 'Freizeit' },
        
        // Sunday
        { day: 'sunday', startTime: '08:00', endTime: '08:20', content: 'Wecken' },
        { day: 'sunday', startTime: '08:20', endTime: '08:30', content: 'Morgenrunde' },
        { day: 'sunday', startTime: '08:30', endTime: '09:30', content: 'Frühstück' },
        { day: 'sunday', startTime: '09:30', endTime: '11:30', content: 'Jahresplanung II' },
        { day: 'sunday', startTime: '11:30', endTime: '13:00', content: 'Packen + Aufräumen' },
        { day: 'sunday', startTime: '13:00', endTime: '14:30', content: 'Snack' },
        { day: 'sunday', startTime: '14:00', endTime: '14:30', content: 'Abfahrt Haus' },
        { day: 'sunday', startTime: '14:30', endTime: '17:00', content: 'Abschlusskreis' },

          
    ],
  });

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


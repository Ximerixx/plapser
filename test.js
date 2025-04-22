const { parseSchedule } = require("./parser/parser");
const fs = require('fs');

async function main() {
    const schedule = await parseSchedule('2025-04-21', 'ИС2-244-ОБ');
    if (schedule) {
        fs.writeFileSync('schedule.json', JSON.stringify(schedule, null, 2));
        console.log(schedule);
    }
}

main();

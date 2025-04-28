const axios = require('axios');
const cheerio = require('cheerio');

async function parseTeacher(date, teacher) {
    if (!teacher) {
        throw new Error('Параметр "teacher" обязателен');
    }

    if (!date) {
        throw new Error('Не удалось определить дату');
    }

    const url = `https://kis.vgltu.ru/schedule?teacher=${encodeURIComponent(teacher)}&date=${date}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const result = {};

    $('.table > div').each((i, block) => {
        const dateDiv = $(block).find('div').first();
        const dayDiv = dateDiv.next('div');

        const dateText = dateDiv.find('strong').text().trim();
        const dayOfWeek = dayDiv.text().trim();

        // Преобразуем дату в формат YYYY-MM-DD для ключа
        const [day, monthStr, year] = dateText.split(' ');
        const months = {
            'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
            'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
            'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12'
        };
        const month = months[monthStr];
        const dateKey = `${year}-${month}-${day.padStart(2, '0')}`;

        result[dateKey] = {
            date: dateText,
            dayOfWeek: dayOfWeek,
            lessons: []
        };

        const rows = $(block).find('table tbody tr');

        rows.each((j, row) => {
            const cells = $(row).find('td');

            if (cells.length === 1) {
                const text = $(cells[0]).text().trim();
                if (text.toLowerCase() === 'нет пар') {
                    result[dateKey].lessons.push({ status: 'Нет пар' });
                }
            } else if (cells.length === 2) {
                const time = $(cells[0]).text().trim();
                const htmlContent = $(cells[1]).html().split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);

                let subject = '';
                let group = null;
                let room = null;

                if (htmlContent[0]) subject = htmlContent[0];
                if (htmlContent[1]) group = htmlContent[1];

                const link = $(cells[1]).find('a').text().trim();
                if (link) room = link;

                result[dateKey].lessons.push({
                    time,
                    subject,
                    group,
                    room
                });
            }
        });
    });

    return result;
}


// // usdap

// const fs = require('fs');
// async function main() {
//     const schedule = await parseTeacher('2025-04-28', 'Бордюжа О.Л.');
//     if (schedule) {
//         fs.writeFileSync('schedule.json', JSON.stringify(schedule, null, 2));
//         console.log(schedule);
//     }
// }

// main();



module.exports = { parseTeacher };

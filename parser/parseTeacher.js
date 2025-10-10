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
                
                // Get all text content split by <br>
                const cellContent = $(cells[1]);
                const htmlContent = cellContent.html().split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
                
                let subject = '';
                let group = '';
                let subgroup = '';
                let room = '';
                
                // Parse each line of content
                htmlContent.forEach((line, index) => {
                    const cleanText = $('<div>').html(line).text().trim();
                    
                    if (index === 0) {
                        // First line is the subject
                        subject = cleanText;
                    } else if (cleanText.includes('п.г.')) {
                        // This is subgroup info (п.г. = подгруппа)
                        subgroup = cleanText;
                    } else if (cleanText && !cleanText.match(/^\d+/)) {
                        // This looks like a group name (not starting with digits like room numbers)
                        // Group names usually match pattern like ИС2-244-ОБ
                        if (cleanText.match(/[А-ЯЁ]{2}\d-\d{3}-[А-ЯЁ]{2}/) || cleanText.length > 3) {
                            group = cleanText;
                        }
                    }
                });
                
                // Extract room from link
                const link = cellContent.find('a').text().trim();
                if (link) {
                    room = link;
                }
                
                // If we only found subgroup but no group, put subgroup in group field
                if (!group && subgroup) {
                    group = subgroup;
                }

                result[dateKey].lessons.push({
                    time,
                    subject,
                    group,
                    room,
                    subgroup: subgroup || null
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

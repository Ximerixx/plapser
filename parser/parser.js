const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const VALID_LESSON_TYPES = new Set(['лек.', 'пр.', 'лаб.']);
const GROUP_REGEX = /^[А-ЯЁ]{2}\d-\d{3}-[А-ЯЁ]{2}$/;

async function parseSchedule(date, group, subgroup = null) {
    try {
        const url = `https://kis.vgltu.ru/schedule?date=${date}&group=${encodeURIComponent(group)}`;
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const result = {};

        // Обработка каждого дня
        $('div.table > div[style="margin-bottom: 25px;"]').each((_, dayBlock) => {
            const $day = $(dayBlock);
            const dateText = $day.find('> div > strong').first().text().trim();
            const dayOfWeek = $day.find('> div').eq(1).text().trim();

            // Конвертация даты
            const [day, month, year] = dateText.split(' ');
            const months = {
                'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
                'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
                'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12'
            };
            const dateKey = `${year}-${months[month]}-${day.padStart(2, '0')}`;

            // Инициализация дня
            result[dateKey] = {
                date: dateText,
                dayOfWeek: dayOfWeek,
                lessons: []
            };

            const $table = $day.find('table');
            const noLessons = $table.find('td:contains("Нет пар")').length > 0;

            if (noLessons) {
                result[dateKey].lessons.push({ status: 'Нет пар' });
                return; // Важно: пропустить обработку занятий
            }

            let currentTime = null;
            let isSubgroupBlock = false;
            let subgroupLinesLeft = 0;

            $table.find('tr').each((_, row) => {
                const $row = $(row);
                const $cells = $row.find('td');

                const timeCell = $cells.filter('[style="width:75px"]');
                const hasTime = timeCell.length > 0;

                // Если это строка с временем
                if (hasTime) {
                    currentTime = timeCell.text().trim().replace(/\s+/g, ' ');

                    const rowspanAttr = timeCell.attr("rowspan");
                    const rowspan = rowspanAttr ? parseInt(rowspanAttr, 10) : 1;

                    if (rowspan === 2) {
                        isSubgroupBlock = true;
                        subgroupLinesLeft = 2; // текущая и следующая
                    } else {
                        isSubgroupBlock = false;
                    }
                }

                if (!currentTime) return; // если всё ещё нет времени — не продолжаем

                if (isSubgroupBlock) {
                    subgroupLinesLeft--;
                    if (subgroupLinesLeft <= 0) {
                        isSubgroupBlock = false;
                    }
                }

                const $content = $cells.filter('[style="width:auto"]');
                if (!$content.length) return;

                const lesson = {
                    time: currentTime,
                    type: '',
                    name: '',
                    subgroup: '',
                    groups: [group],
                    classroom: '',
                    teacher: ''
                };

                // Разбивка содержимого на элементы
                const elements = [];
                let buffer = '';

                $content.contents().each((_, el) => {
                    if (el.type === 'text') {
                        buffer += $(el).text().trim();
                    } else if (el.name === 'br') {
                        if (buffer) elements.push(buffer);
                        buffer = '';
                    } else if (el.name === 'a') {
                        if (buffer) elements.push(buffer);
                        elements.push({ type: 'auditory', value: $(el).text().trim() });
                        buffer = '';
                    }
                });
                if (buffer) elements.push(buffer);

                // by element things 
                let hasType = false;
                elements.forEach((element, idx) => {
                    if (typeof element === 'object') {
                        lesson.classroom = element.value;
                        return;
                    }

                    if (!hasType) {
                        const parts = element.split('.');
                        if (parts.length > 1 && VALID_LESSON_TYPES.has(parts[0].toLowerCase() + '.')) {
                            lesson.type = parts[0].trim();
                            lesson.name = parts.slice(1).join('.').trim();
                            hasType = true;
                        } else {
                            lesson.name = element;
                            hasType = true;
                        }
                        return;
                    }

                    if (element.includes('п.г.')) {
                        lesson.subgroup = element.replace('п.г.', '').trim();
                        return;
                    }

                    if (GROUP_REGEX.test(element) && !lesson.groups.includes(element)) {
                        lesson.groups.push(element);
                        return;
                    }

                    if (idx === elements.length - 1 && element.match(/[А-ЯЁ][а-яё]*\s[А-ЯЁ]\.[А-ЯЁ]\.?$/)) {
                        lesson.teacher = element.replace(/\.$/, '');
                    }
                });

                if (subgroup !== undefined && subgroup !== null) {
                    const subgroupStr = String(subgroup);

                    if (lesson.subgroup && lesson.subgroup !== subgroupStr) return;
                }





                result[dateKey].lessons.push(lesson);
            });
        });

        return result;

    } catch (error) {
        console.error('parser error:', error.message);
        return null;
    }



}
// // usdap
// async function main() {
//     const schedule = await parseSchedule('2025-04-21', 'ИС2-244-ОБ');
//     if (schedule) {
//         fs.writeFileSync('schedule.json', JSON.stringify(schedule, null, 2));
//         console.log(schedule);
//     }
// }

// main();


module.exports = { parseSchedule }; 
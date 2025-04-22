// server.js
const express = require("express");
const { createEvents } = require("ics");
const path = require("path");
const { parseSchedule } = require("./parser/parser");

const app = express();
const port = 3000;

function getDateOffset(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

app.get("/gen", async (req, res) => {
    const { date, group, type, tomorrow } = req.query;

    if (!group || !type) {
        return res.status(400).send("need: group, type (+ date or tomorrow/ics-week)");
    }

    let baseDate;

    if (tomorrow === "true") {
        baseDate = getDateOffset(1);
    } else if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).send("Bad date data. Should be YYYY-MM-DD");
        }
        baseDate = date;
    } else {
        baseDate = getDateOffset(0); // сегодня
    }

    try {
        if (type === "ics-week") {
            const allEvents = [];

            for (let i = 0; i < 7; i++) {
                const day = getDateOffset(i);
                const fullData = await parseSchedule(day, group);
                const lessons = (fullData?.[day]?.lessons || []).filter(l => l.time && l.time.includes("-"));

                const events = lessons.map(lesson => {
                    const [startTime, endTime] = lesson.time.split("-");
                    const [hourStart, minStart] = startTime.split(":").map(Number);
                    const [hourEnd, minEnd] = endTime.split(":").map(Number);
                    const [year, month, dayNum] = day.split("-").map(Number);

                    return {
                        title: lesson.name + (lesson.type ? ` (${lesson.type})` : ""),
                        start: [year, month, dayNum, hourStart, minStart],
                        end: [year, month, dayNum, hourEnd, minEnd],
                        description: `${lesson.teacher}${lesson.subgroup ? ` | П/г: ${lesson.subgroup}` : ""}`,
                        location: lesson.classroom
                    };
                });

                allEvents.push(...events);
            }

            createEvents(allEvents, { startOutputType: 'local' }, (error, value) => {
                if (error) {
                    console.error(error);
                    return res.status(500).send("error to generate ICS file in ICS handler");
                }

                res.setHeader("Content-Type", "text/calendar");
                res.setHeader("Content-Disposition", "inline; filename=schedule-week.ics");
                res.setHeader("Cache-Control", "no-store");
                res.setHeader("X-Published-TTL", "PT1H");

                res.send(value);
            });
        } else {
            const fullData = await parseSchedule(baseDate, group);
            if (!fullData || !fullData[baseDate]) {
                return res.status(404).send("no lessons");
            }

            const lessons = fullData[baseDate].lessons || [];

            const schedule = lessons
                .filter(l => l.time && l.time.includes("-"))
                .map(lesson => {
                    const [startTime, endTime] = lesson.time.split("-");
                    const [hourStart, minStart] = startTime.split(":").map(Number);
                    const [hourEnd, minEnd] = endTime.split(":").map(Number);
                    const [year, month, dayNum] = baseDate.split("-").map(Number);

                    return {
                        title: (lesson.type ? ` (${lesson.type})` : "" + lesson.name),
                        start: [year, month, dayNum, hourStart, minStart],
                        end: [year, month, dayNum, hourEnd, minEnd],
                        description: `${lesson.teacher}${lesson.subgroup ? ` | П/г: ${lesson.subgroup}` : ""}`,
                        location: lesson.classroom
                    };
                });

            if (type === "json") {
                return res.json(schedule);
            }

            if (type === "ics") {
                createEvents(schedule, { startOutputType: 'local' }, (error, value) => {
                    if (error) {
                        console.error(error);
                        return res.status(500).send("error to generate ICS file in ICS handler");
                    }

                    res.setHeader("Content-Type", "text/calendar");
                    res.setHeader("Content-Disposition", "inline; filename=schedule.ics");
                    res.setHeader("Cache-Control", "no-store");
                    res.setHeader("X-Published-TTL", "PT1H");

                    res.send(value);
                });
            } else {
                res.status(400).send("type should be only 'json', 'ics' or 'ics-week'");
            }
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Error that hard to understand");
    }
});

app.listen(port, () => {
    console.log(`server ok!`);
});
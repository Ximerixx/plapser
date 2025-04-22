// server.js — с ical-generator и поддержкой TZID
const express = require("express");
const ical = require("ical-generator").default;
const { parseSchedule } = require("./parser/parser");

const app = express();
const port = 3000;
const TIMEZONE = "Europe/Moscow";

function getDateOffset(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

app.get("/gen", async (req, res) => {
    //const { date, group, type: rawType, tomorrow, subgroup } = req.query;
    const { date, group, type: rawType, tomorrow, subgroup = null } = req.query;

    if (!group || !rawType) {
        return res.status(400).send("Need: group, type (+ date or tomorrow/ics-week)");
    }

    const type = rawType.toLowerCase();
    let baseDate;

    if (tomorrow === "true") {
        baseDate = getDateOffset(1);
    } else if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).send("Bad date format. Use YYYY-MM-DD");
        }
        baseDate = date;
    } else {
        baseDate = getDateOffset(0); // сегодня
    }

    try {
        if (type === "json") {
            const fullData = await parseSchedule(baseDate, group, subgroup);
            const lessons = (fullData?.[baseDate]?.lessons || []).filter(l => l.time && l.time.includes("-"));
            return res.json(lessons);
        }

        const calendar = ical({
            name: `Расписание для ${group}`,
            timezone: TIMEZONE
        });

        const daysToGenerate = type === "ics-week" ? 7 : 1;

        for (let i = 0; i < daysToGenerate; i++) {
            const day = getDateOffset(i);
            const fullData = await parseSchedule(day, group, subgroup);
            const lessons = (fullData?.[day]?.lessons || []).filter(l => l.time && l.time.includes("-"));

            for (const lesson of lessons) {
                const [startTime, endTime] = lesson.time.split("-");
                const [hourStart, minStart] = startTime.split(":").map(Number);
                const [hourEnd, minEnd] = endTime.split(":").map(Number);
                const [year, month, dayNum] = day.split("-").map(Number);

                calendar.createEvent({
                    start: new Date(year, month - 1, dayNum, hourStart, minStart),
                    end: new Date(year, month - 1, dayNum, hourEnd, minEnd),
                    summary: lesson.name + (lesson.type ? ` (${lesson.type})` : ""),
                    description: `${lesson.teacher}${lesson.subgroup ? ` | П/г: ${lesson.subgroup}` : ""}`,
                    location: lesson.classroom,
                    timezone: TIMEZONE
                });
            }
        }

        res.setHeader("Content-Type", "text/calendar");
        res.setHeader("Content-Disposition", `inline; filename=schedule${type === "ics-week" ? "-week" : ""}.ics`);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Published-TTL", "PT1H");

        res.send(calendar.toString());
    } catch (err) {
        console.error(err);
        res.status(500).send("damm 500, you must be hard on this, don't you?");
    }
});

app.listen(port, () => {
    console.log(`server ok!`);
});

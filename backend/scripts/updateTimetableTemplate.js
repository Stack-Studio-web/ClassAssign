const xlsx = require("xlsx");
const path = require("path");

const templatePath = path.join(__dirname, "..", "..", "format", "Timetable_Bulk_Import_Template.xlsx");

const headers = [
  "Date",
  "Start Time",
  "End Time",
  "Session",
  "Course Code",
  "Course Name",
  "Department",
  "Batch",
  "Exam Type",
];

const cleanSamples = [
  {
    Date: "2026-09-29",
    "Start Time": "09:00",
    "End Time": "11:00",
    Session: "FN",
    "Course Code": "24BCS101",
    "Course Name": "Data Structures",
    Department: "BCS",
    Batch: "24BCS",
    "Exam Type": "CAT1",
  },
  {
    Date: "2026-09-29",
    "Start Time": "14:00",
    "End Time": "16:00",
    Session: "AN",
    "Course Code": "24BAD201",
    "Course Name": "Database Management",
    Department: "BAD",
    Batch: "24BAD",
    "Exam Type": "CAT1",
  },
  {
    Date: "2026-09-30",
    "Start Time": "09:00",
    "End Time": "11:00",
    Session: "FN",
    "Course Code": "24BIT301",
    "Course Name": "Computer Networks",
    Department: "BIT",
    Batch: "24BIT",
    "Exam Type": "CAT2",
  },
];

const instructions = [
  ["TIMETABLE BULK IMPORT TEMPLATE"],
  [""],
  ["INSTRUCTIONS:"],
  [""],
  ['1. Fill in the "Timetable" sheet with your exam schedule data'],
  ["2. Follow the exact format shown in the sample rows"],
  ["3. Delete the sample data before importing (or keep as reference)"],
  ["4. Save the file and upload via the Bulk Import tab"],
  [""],
  ["COLUMN ORDER (required):"],
  ["Date | Start Time | End Time | Session | Course Code | Course Name | Department | Batch | Exam Type"],
  [""],
  ["Date:"],
  ["  • Format: YYYY-MM-DD (e.g., 2026-09-29)"],
  ["  • Must be today or a future date"],
  [""],
  ["Start Time / End Time:"],
  ["  • Format: HH:MM in 24-hour format (e.g., 09:00, 14:00)"],
  ["  • End Time must be after Start Time"],
  [""],
  ["Session:"],
  ["  • Only FN or AN (case-sensitive uppercase)"],
  [""],
  ["Course Code / Course Name:"],
  ["  • Course Code must exist in student data for the Department/Batch"],
  [""],
  ["Department:"],
  ["  • Uppercase 3-letter code (e.g., BCS, BAD, BIT, BCE, BME)"],
  [""],
  ["Batch (REQUIRED):"],
  ["  • Format: YY + Department Code — pattern ^[0-9]{2}[A-Z]{3}$"],
  ["  • Examples: 24BCS, 24BAD, 24BIT"],
  ["  • Must match Department (Department=BCS → Batch like 24BCS)"],
  ["  • Batch must already exist in the Academic Context (not auto-created)"],
  [""],
  ["Exam Type:"],
  ["  • Only CAT1, CAT2, or SEM (case-sensitive uppercase)"],
];

const newWb = xlsx.utils.book_new();
const ttSheet = xlsx.utils.json_to_sheet(cleanSamples, { header: headers });
xlsx.utils.book_append_sheet(newWb, ttSheet, "Timetable");
const instrSheet = xlsx.utils.aoa_to_sheet(instructions);
xlsx.utils.book_append_sheet(newWb, instrSheet, "Instructions");
xlsx.writeFile(newWb, templatePath);
console.log("Updated", templatePath);

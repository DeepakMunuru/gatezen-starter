import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";
import qrcode from "qrcode";
import nodemailer from "nodemailer";
import prisma from "../lib/prisma.js";
import jwt from "jsonwebtoken";
import axios from "axios";

dotenv.config();
const token = process.env.JWT_SECRET;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const visitors = [];
const app = express();

app.use(cors());
app.use(express.json());

// ---------------------- Auth Middleware ----------------------
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = decoded;
    next();
  });
};

// ---------------------- Auth Routes ----------------------

// Login
app.post("/login", async (req, res) => {
  const { email, password, "g-recaptcha-response": recaptchaToken } = req.body;

  if (!recaptchaToken) {
    return res.status(400).json({ error: "pls complete the recaptcha test" });
  }

  try {
    const verifyRes = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaToken,
      })
    );

    if (!verifyRes.data.success) {
      return res.status(400).json({ error: "reCAPTCHA verification failed" });
    }
  } catch (err) {
    return res.status(400).json({ error: "reCAPTCHA verification failed" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email, password } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const jwttoken = jwt.sign({ userId: user.id }, token);
    return res.status(200).json({ user, jwttoken });
  } catch (e) {
    console.error("Error logging in:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Signup
app.post("/signup", async (req, res) => {
  const { name, email, password, "g-recaptcha-response": recaptchaToken } = req.body;

  if (!recaptchaToken) {
    return res.status(400).json({ error: "pls complete the recaptcha test" });
  }

  try {
    const verifyRes = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaToken,
      })
    );

    if (!verifyRes.data.success) {
      return res.status(400).json({ error: "reCAPTCHA verification failed" });
    }
  } catch (err) {
    return res.status(400).json({ error: "reCAPTCHA verification failed" });
  }

  try {
    const user = await prisma.user.create({
      data: { name, email, password },
    });

    const jwttoken = jwt.sign({ userId: user.id }, token);
    return res.status(201).json({ user, jwttoken });
  } catch (e) {
    console.error("Error signing up:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Check existing user
app.get("/existing-user", async (req, res) => {
  const { email } = req.query;
  const existingUser = await prisma.user.findUnique({ where: { email } });
  const jwttoken = jwt.sign({ userId: existingUser.id }, token);

  if (existingUser) {
    return res.status(200).json({ exists: true, user: existingUser, jwttoken });
  }
  return res.status(200).json({ exists: false });
});

// ---------------------- Visitor Creation ----------------------
app.post("/visitor-creation", authMiddleware, async (req, res) => {
  try {
    const { name, email } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: "Missing required fields: name and email" });
    }

    const id = uuid();
    const newVisitor = { id, name, email };
    visitors.push(newVisitor);

    const qrPngBuffer = await qrcode.toBuffer(
      "http://localhost:4000/scan?id=" + id,
      {
        type: "png",
        width: 300,
        margin: 2,
        errorCorrectionLevel: "M",
      }
    );

    const qrCid = `qr-${id}@gatezen`;
    const subject = `Your GateZen visitor pass (QR) — ${name}`;

    await transporter.sendMail({
      from: process.env.EMAIL_ID,
      to: email,
      subject,
      text: `Hi ${name},\n\nPlease scan this QR code at the entrance to check in:`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
          <h2 style="margin: 0 0 12px;">Hi ${name},</h2>
          <p style="margin: 0 0 12px;">Your visitor pass is ready. Show this QR at the gate:</p>
          <p style="margin: 0 0 16px;">
            <img src="cid:${qrCid}" alt="Visitor QR Code" width="300" height="300" 
              style="display:block;border:0;outline:none;text-decoration:none;" />
          </p>
          <p style="margin: 0;">Thanks,<br/>GateZen</p>
        </div>
      `,
      attachments: [
        {
          filename: "visitor-qr.png",
          content: qrPngBuffer,
          contentType: "image/png",
          cid: qrCid,
        },
      ],
    });

    return res.status(201).json({
      visitor: newVisitor,
      message: "Visitor created and QR email dispatched",
    });
  } catch (err) {
    console.error("Error creating visitor / sending QR email:", err);
    return res.status(500).json({ error: "Failed to create visitor or send email" });
  }
});

// Scan visitor QR
app.get("/scan", (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: "Missing visitor ID" });
  }

  const visitor = visitors.find((v) => v.id === id);
  if (!visitor) {
    return res.status(404).json({ error: "Visitor not found" });
  }

  return res.status(200).json({ visitor });
});

// ---------------------- Maintenance Module ----------------------

// GET /maintenance?userId=xyz
app.get("/maintenance", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.query;
    const tickets = await prisma.ticket.findMany({
      where: { userId },
      include: {
        comments: { include: { user: true } },
        images: true,
        history: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(tickets);
  } catch (err) {
    console.error("Error fetching tickets:", err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// POST /maintenance
app.post("/maintenance", authMiddleware, async (req, res) => {
  try {
    const { userId, title, category, description, images } = req.body;

    if (!userId || !title || !category) {
      return res
        .status(400)
        .json({ error: "Missing required fields: userId, title, category" });
    }

    const ticket = await prisma.ticket.create({
      data: {
        title,
        category,
        description,
        userId,
        status: "SUBMITTED",
        images: {
          create: (images || []).map((url) => ({ url })),
        },
        history: {
          create: { status: "SUBMITTED", note: "Ticket created" },
        },
      },
      include: { comments: true, images: true, history: true },
    });

    broadcastEvent("maintenance", { action: "created", ticket });
    res.status(201).json(ticket);
  } catch (err) {
    console.error("Error creating ticket:", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// POST /maintenance/:id/comments
app.post("/maintenance/:id/comments", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, name, text } = req.body;

    const comment = await prisma.comment.create({
      data: { text, userId, ticketId: id },
      include: { user: true },
    });

    broadcastEvent("maintenance", { action: "comment", ticketId: id, comment });

    res.status(201).json({
      id: comment.id,
      text: comment.text,
      userId: comment.userId,
      name: name || comment.user?.name,
      at: comment.createdAt,
    });
  } catch (err) {
    console.error("Error adding comment:", err);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// PATCH /maintenance/:id/status
app.patch("/maintenance/:id/status", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    let { status } = req.body;

    // Map frontend status to Prisma enum
    if (status === "in_progress") status = "IN_PROGRESS";
    if (status === "resolved") status = "RESOLVED";
    if (status === "submitted") status = "SUBMITTED";

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        status,
        history: {
          create: { status, note: `Status changed to ${status}` },
        },
      },
      include: { comments: true, images: true, history: true },
    });

    broadcastEvent("maintenance", { action: "status", ticketId: id, status });
    res.json(ticket);
  } catch (err) {
    console.error("Error changing ticket status:", err);
    res.status(500).json({ error: "Failed to change status" });
  }
});

// POST /maintenance/:id/images
app.post("/maintenance/:id/images", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { imageUrl } = req.body;

    await prisma.image.create({
      data: { url: imageUrl, ticketId: id },
    });

    broadcastEvent("maintenance", { action: "image", ticketId: id });
    res.json({ message: "Image attached" });
  } catch (err) {
    console.error("Error attaching image:", err);
    res.status(500).json({ error: "Failed to attach image" });
  }
});

// ---------------------- SSE ----------------------
const clients = [];

function broadcastEvent(event, data) {
  clients.forEach((res) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    clients.splice(clients.indexOf(res), 1);
  });
});



// ---------------------- Facilities ----------------------
app.get("/facilities", authMiddleware, async (req, res) => {
  try {
    const facilities = await prisma.facility.findMany({
      orderBy: { name: "asc" },
    });
    res.json(facilities);
  } catch (err) {
    console.error("Error fetching facilities:", err);
    res.status(500).json({ error: "Failed to fetch facilities" });
  }
});

app.post("/facilities", authMiddleware, async (req, res) => {
  try {
    const { name, open, close, slotMins } = req.body;
    if (!name || !open || !close || !slotMins) {
      return res.status(400).json({ error: "name, open, close, slotMins are required" });
    }
    const facility = await prisma.facility.create({ data: { name, open, close, slotMins: Number(slotMins) } });
    res.status(201).json(facility);
  } catch (err) {
    console.error("Error creating facility:", err);
    res.status(500).json({ error: "Failed to create facility" });
  }
});

app.put("/facilities/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const facility = await prisma.facility.update({ where: { id }, data: req.body });
    res.json(facility);
  } catch (err) {
    console.error("Error updating facility:", err);
    res.status(500).json({ error: "Failed to update facility" });
  }
});

app.delete("/facilities/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.facility.delete({ where: { id } });
    res.json({ message: "Facility deleted" });
  } catch (err) {
    console.error("Error deleting facility:", err);
    res.status(500).json({ error: "Failed to delete facility" });
  }
});



// ---------------------- Bookings ----------------------
function toHM(date) {
  // returns "HH:mm" in local time
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// GET /bookings?facilityId=&date=YYYY-MM-DD
app.get("/bookings", authMiddleware, async (req, res) => {
  try {
    const { facilityId, date } = req.query;
    if (!facilityId || !date) {
      return res.status(400).json({ error: "facilityId and date are required" });
    }

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600e3);

    const list = await prisma.booking.findMany({
      where: {
        facilityId,
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { startsAt: "asc" },
    });

    // Map DB enum -> frontend lowercase string
    const payload = list.map((b) => ({
      ...b,
      status: b.status === "CANCELLED" ? "cancelled" : "confirmed",
    }));

    res.json(payload);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// POST /bookings
app.post("/bookings", authMiddleware, async (req, res) => {
  try {
    const { userId, facilityId, startsAt, endsAt, note } = req.body;
    if (!userId || !facilityId || !startsAt || !endsAt) {
      return res.status(400).json({ error: "userId, facilityId, startsAt, endsAt are required" });
    }

    const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
    if (!facility) return res.status(404).json({ error: "Facility not found" });

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!(start < end)) return res.status(400).json({ error: "Invalid time range" });

    // Check within open/close window (compare HH:mm strings)
    const startHM = toHM(start);
    const endHM = toHM(end);
    if (startHM < facility.open || endHM > facility.close) {
      return res.status(400).json({ error: `Booking must be within ${facility.open}–${facility.close}` });
    }

    // Check slot alignment (duration multiple of slotMins)
    const durationMins = Math.round((end.getTime() - start.getTime()) / 60000);
    if (durationMins % facility.slotMins !== 0) {
      return res.status(400).json({ error: `Duration must align to ${facility.slotMins} minutes` });
    }

    // Overlap check against CONFIRMED bookings
    const sameDayStart = new Date(start);
    sameDayStart.setHours(0, 0, 0, 0);
    const sameDayEnd = new Date(sameDayStart.getTime() + 24 * 3600e3);

    const existing = await prisma.booking.findMany({
      where: {
        facilityId,
        status: "CONFIRMED",
        startsAt: { gte: sameDayStart, lt: sameDayEnd },
      },
    });

    const hasConflict = existing.some((b) =>
      overlaps(start, end, new Date(b.startsAt), new Date(b.endsAt))
    );

    if (hasConflict) {
      return res.status(409).json({ error: "Time slot conflict" });
    }

    const created = await prisma.booking.create({
      data: {
        userId,
        facilityId,
        startsAt: start,
        endsAt: end,
        note,
        status: "CONFIRMED",
      },
    });

    broadcastEvent("booking", { action: "created", bookingId: created.id, facilityId });

    // map status for frontend
    res.status(201).json({ ...created, status: "confirmed" });
  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// PATCH /bookings/:id/cancel
app.patch("/bookings/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    broadcastEvent("booking", { action: "cancelled", bookingId: id, facilityId: updated.facilityId });
    res.json({ ...updated, status: "cancelled" });
  } catch (err) {
    console.error("Error cancelling booking:", err);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

// (Optional) admin delete
app.delete("/bookings/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.booking.delete({ where: { id } });
    broadcastEvent("booking", { action: "deleted", bookingId: id });
    res.json({ message: "Booking deleted" });
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ error: "Failed to delete booking" });
  }
});

// ---------------------- Events ----------------------
// GET /events  -> returns attendees as array of user IDs (frontend expects ev.attendees.includes(user.id))
app.get("/events", authMiddleware, async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      include: { rsvps: true },
      orderBy: { startsAt: "asc" },
    });

    const payload = events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      attendees: e.rsvps.map((r) => r.userId),
    }));

    res.json(payload);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// POST /events  (simple creator)
app.post("/events", authMiddleware, async (req, res) => {
  try {
    const { title, description, location, startsAt, endsAt } = req.body;
    if (!title || !location || !startsAt || !endsAt) {
      return res.status(400).json({ error: "title, location, startsAt, endsAt are required" });
    }
    const created = await prisma.event.create({
      data: { title, description, location, startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
    });
    broadcastEvent("event", { action: "created", eventId: created.id });
    res.status(201).json({ ...created, attendees: [] });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// POST /events/:id/rsvp  -> toggle; frontend sends { userId }
app.post("/events/:id/rsvp", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // frontend passes this explicitly

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const existing = await prisma.rSVP.findFirst({ where: { userId, eventId: id } });

    if (existing) {
      await prisma.rSVP.delete({ where: { id: existing.id } });
    } else {
      await prisma.rSVP.create({ data: { userId, eventId: id } });
    }

    const refreshed = await prisma.event.findUnique({
      where: { id },
      include: { rsvps: true },
    });

    const payload = {
      id: refreshed.id,
      title: refreshed.title,
      description: refreshed.description,
      location: refreshed.location,
      startsAt: refreshed.startsAt,
      endsAt: refreshed.endsAt,
      attendees: refreshed.rsvps.map((r) => r.userId),
    };

    broadcastEvent("event", { action: "rsvp", eventId: id, userId });
    res.json(payload);
  } catch (err) {
    console.error("Error toggling RSVP:", err);
    res.status(500).json({ error: "Failed to toggle RSVP" });
  }
});

// Optional updates/deletes
app.put("/events/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await prisma.event.update({
      where: { id },
      data: req.body,
    });
    broadcastEvent("event", { action: "updated", eventId: id });
    res.json(updated);
  } catch (err) {
    console.error("Error updating event:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});

app.delete("/events/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.event.delete({ where: { id } });
    broadcastEvent("event", { action: "deleted", eventId: id });
    res.json({ message: "Event deleted" });
  } catch (err) {
    console.error("Error deleting event:", err);
    res.status(500).json({ error: "Failed to delete event" });
  }
});



// ---------------------- Server ----------------------
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`GateZen backend running on http://localhost:${port}`);
});

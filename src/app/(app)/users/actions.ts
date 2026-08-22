"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { requireOwnerApi } from "@/lib/guards";
import { audit } from "@/lib/audit";

export type ActionResult = { ok: boolean; error?: string; message?: string };

const pwSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirm: z.string(),
});

export async function changePassword(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const actor = await requireOwnerApi();
    const parsed = pwSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const { userId, newPassword, confirm } = parsed.data;
    if (newPassword !== confirm) return { ok: false, error: "Passwords do not match" };

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, error: "User not found" };

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    await audit({ id: actor.id, username: actor.username }, "PASSWORD_CHANGE", "User", userId, `Changed password for ${user.username}`);
    revalidatePath("/users");
    return { ok: true, message: `Password updated for ${user.username}` };
}, (error) => ({ ok: false, error }));
}

// --- Improvement 10: add more staff logins --------------------------------
const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["OWNER", "STAFF"]).default("STAFF"),
});

export async function createUser(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const actor = await requireOwnerApi();
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const d = parsed.data;

    const existing = await prisma.user.findUnique({ where: { username: d.username.toLowerCase() } });
    if (existing) return { ok: false, error: "That username is already taken" };

    const user = await prisma.user.create({
      data: {
        name: d.name,
        username: d.username.toLowerCase(),
        passwordHash: await bcrypt.hash(d.password, 10),
        role: d.role,
      },
    });

    await audit({ id: actor.id, username: actor.username }, "USER_CREATE", "User", user.id, `Created ${d.role} login “${user.username}”`);
    revalidatePath("/users");
    return { ok: true, message: `Login “${user.username}” created` };
}, (error) => ({ ok: false, error }));
}

const toggleSchema = z.object({ userId: z.string().min(1) });

// Deactivate rather than delete, so the activity history stays meaningful.
export async function toggleUserActive(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const actor = await requireOwnerApi();
    const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: "Invalid input" };

    const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return { ok: false, error: "User not found" };
    if (user.id === actor.id) return { ok: false, error: "You cannot deactivate your own login" };

    if (user.active && user.role === "OWNER") {
      const owners = await prisma.user.count({ where: { role: "OWNER", active: true } });
      if (owners <= 1) return { ok: false, error: "There must be at least one active owner" };
    }

    await prisma.user.update({ where: { id: user.id }, data: { active: !user.active } });
    await audit(
      { id: actor.id, username: actor.username },
      user.active ? "USER_DEACTIVATE" : "USER_ACTIVATE",
      "User",
      user.id,
      `${user.active ? "Deactivated" : "Reactivated"} login “${user.username}”`
    );
    revalidatePath("/users");
    return { ok: true, message: `${user.username} ${user.active ? "deactivated" : "reactivated"}` };
}, (error) => ({ ok: false, error }));
}

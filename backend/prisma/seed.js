import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

const SUPABASE_URL = "https://lycnyrqtrlytydbjdput.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5Y255cnF0cmx5dHlkYmpkcHV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjI4ODU1NywiZXhwIjoyMDcxODY0NTU3fQ.MP4nigoNV96M0hcvJ_HwKU3_c1BNrLrDDoMDed9uWag";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const email = "yettodecide02@gmail.com";
const password = "yetToDecide@02";
const name = "Rem";

// Try to fetch the user from Supabase Auth
const { data: userData, error: fetchError } = await supabase.auth.admin.listUsers();

let supabaseUser = userData?.users?.find(u => u.email === email);

if (!supabaseUser) {
    // If not found, create the user
    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (error) {
        console.error("Error creating user in Supabase Auth:", error);
        process.exit(1);
    }
    supabaseUser = data.user;
    console.log("User created in Supabase Auth:", supabaseUser);
} else {
    console.log("User already exists in Supabase Auth:", supabaseUser);
}

// Add the same user to your Prisma DB
await prisma.user.create({
    data: {
        email,
        password,
        name,
        id: supabaseUser.id // Use Supabase Auth user id for consistency
    }
});
console.log("User seeded in Prisma DB ✅");

await prisma.$disconnect();
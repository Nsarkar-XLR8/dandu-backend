const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const user = await prisma.authUser.findFirst();
  console.log(user);
}
run();

import { RoleCatalog } from "../core/RoleCatalog.ts";

const roles = await new RoleCatalog().listRoles();
for (const role of roles) {
  console.log(`${role.id}\t${role.role}\t${role.outputSchema}\t${role.description}`);
}

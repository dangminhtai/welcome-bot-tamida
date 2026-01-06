import mongoose from "mongoose";
const RoleConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    roleId: { type: String, required: true },
    buttonId: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    style: { type: String, default: "Primary" }, // ButtonStyle
});
export default mongoose.model("RoleConfig", RoleConfigSchema);

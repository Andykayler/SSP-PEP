// ─── Constants ────────────────────────────────────────────────────────────────
export const ROLES = [
  { value: "head_teacher",  label: "Head Teacher",  badgeClass: "badge--purple" },
  { value: "class_teacher", label: "Class Teacher", badgeClass: "badge--blue"   },
  { value: "bursar",        label: "Bursar / Fees", badgeClass: "badge--amber"  },
  { value: "librarian",     label: "Librarian",     badgeClass: "badge--teal"   },
];
export const roleMap = Object.fromEntries(ROLES.map(r => [r.value, r]));

export const GENDERS   = ["Male", "Female"];
export const DISTRICTS = ["Blantyre","Lilongwe","Mzuzu","Zomba","Kasungu","Mangochi","Salima","Dedza","Ntchisi","Dowa","Nkhotakota","Mchinji","Chiradzulu","Mulanje","Thyolo","Phalombe","Balaka","Machinga","Nsanje","Chikwawa","Neno","Mwanza","Nkhata Bay","Rumphi","Karonga","Chitipa","Likoma","Ntcheu"];
export const PRIMARY_SUBJECTS   = ["Chichewa","English","Mathematics","Science and Technology","Social and Environmental Sciences","Expressive Arts","Agriculture","Life Skills","Religious and Moral Education"];
export const SECONDARY_SUBJECTS = ["English","Chichewa","Mathematics","Biology","Chemistry","Physics","Agriculture","Geography","History","Social and Development Studies","Life Skills","Bible Knowledge"];

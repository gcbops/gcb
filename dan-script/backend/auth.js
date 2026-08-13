function requireAuthorizedUser() {
  const email = Session.getActiveUser().getEmail().toLowerCase();

  if (!email) {
    throw new Error("Unable to identify the current user.");
  }

  const allowedUsers = PropertiesService.getScriptProperties()
    .getProperty("AUTHORIZED_USERS")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedUsers.includes(email)) {
    throw new Error("Unauthorized access.");
  }

  return email;
}

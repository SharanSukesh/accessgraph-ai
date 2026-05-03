// Manually run the post-install handler
// (auto-runs in managed packages, must be triggered manually in unlocked packages)
System.debug('===== Running Post-Install Handler =====');

AccessGraphPostInstall handler = new AccessGraphPostInstall();
handler.onInstall(new ManualInstallContext());

System.debug('===== Post-Install Complete =====');

// Stub InstallContext for manual invocation
public class ManualInstallContext implements InstallContext {
    public Boolean isUpgrade() { return false; }
    public Boolean isPush() { return false; }
    public Version previousVersion() { return null; }
    public Id installerID() { return UserInfo.getUserId(); }
    public Id organizationId() { return UserInfo.getOrganizationId(); }
}

export function signingOptions(environment) {
  const release = environment.CLIPKEEP_RELEASE_MODE === 'developer-id';
  if (release && (!environment.CLIPKEEP_SIGN_IDENTITY?.startsWith('Developer ID Application:') || !environment.CLIPKEEP_NOTARY_PROFILE)) {
    throw new Error('Developer ID distribution requires an explicit Application identity and user-configured notary profile');
  }
  return {
    osxSign: {
      identity: release ? environment.CLIPKEEP_SIGN_IDENTITY : '-', identityValidation: release,
      preAutoEntitlements: false, preEmbedProvisioningProfile: false, strictVerify: true,
      ...(release ? {} : { ignore: [/\/Contents\/Resources\/yt-dlp$/] }),
      optionsForFile: () => ({ hardenedRuntime: release, timestamp: release ? undefined : 'none', entitlements: 'assets/entitlements.plist' }),
    },
    ...(release ? { osxNotarize: { keychainProfile: environment.CLIPKEEP_NOTARY_PROFILE } } : {}),
  };
}

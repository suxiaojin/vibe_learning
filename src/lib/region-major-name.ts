export function getRegionMajorName(profile: {
  regionId?: string | null;
  major?: { name: string; regions?: Array<{ regionId: string; displayName: string | null }> } | null;
} | null | undefined): string | null {
  const major = profile?.major;
  if (!major) return null;
  return major.regions?.find((binding) => binding.regionId === profile?.regionId)?.displayName || major.name;
}

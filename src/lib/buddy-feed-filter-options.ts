export type FeedFilterRegion = { id: string; province: string; studySystem: string };
export type FeedFilterMajor = { id: string; name: string; regions: Array<{ regionId: string; displayName: string | null }> };

export function getFeedFilterOptions(regions: FeedFilterRegion[], majors: FeedFilterMajor[], province: string, studySystem: string) {
  const provinces = Array.from(new Set(regions.map((region) => region.province))).filter(Boolean);
  const eligibleRegions = regions.filter((region) => !province || region.province === province);
  const studySystems = Array.from(new Set(eligibleRegions.map((region) => region.studySystem))).filter(Boolean);
  const matchingRegionIds = new Set(eligibleRegions.filter((region) => !studySystem || region.studySystem === studySystem).map((region) => region.id));
  const availableMajors = majors.flatMap((major) => {
    const bindings = major.regions.filter((item) => matchingRegionIds.has(item.regionId));
    if (!bindings.length) return [];
    const names = Array.from(new Set(bindings.map((item) => item.displayName || major.name)));
    return [{ id: major.id, name: names.join(" / ") }];
  });
  return { provinces, studySystems, majors: availableMajors };
}

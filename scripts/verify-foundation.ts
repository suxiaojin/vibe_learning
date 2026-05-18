import { FoundationSelectionError, getFoundationOptions, saveStudentFoundationProfile } from "../src/lib/foundation";

async function main() {
  const options = await getFoundationOptions();
  const regionSummaries = await Promise.all(
    options.regions.map(async (region) => {
      const regionOptions = await getFoundationOptions(region.id);
      return {
        id: region.id,
        name: region.name,
        publicSubjects: regionOptions.publicSubjects.length,
        majors: regionOptions.majors.length,
        ready: regionOptions.publicSubjects.length > 0 && regionOptions.majors.length > 0
      };
    })
  );

  let invalidSelectionCheck = "failed";
  try {
    await saveStudentFoundationProfile("__verify_foundation_user__", {
      regionId: "__missing_region__",
      publicSubjectId: "__missing_public_subject__",
      majorId: "__missing_major__"
    });
  } catch (error) {
    if (error instanceof FoundationSelectionError && error.status === 400) {
      invalidSelectionCheck = "passed";
    } else {
      throw error;
    }
  }

  const readyRegions = regionSummaries.filter((region) => region.ready);
  const report = {
    activeRegions: options.regions.length,
    defaultRegionId: options.selectedRegionId,
    readyRegions: readyRegions.length,
    invalidSelectionCheck,
    regions: regionSummaries
  };

  console.log(JSON.stringify(report, null, 2));

  if (options.regions.length === 0) {
    throw new Error("No active regions found.");
  }
  if (readyRegions.length === 0) {
    throw new Error("No active region has both published public subjects and published majors.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

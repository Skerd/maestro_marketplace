import type {HydratedDocument} from "mongoose";
import ProviderProfile, {type IProviderProfile} from "./providerProfile";
import {getLogger, serverLogger} from "@coreModule/loggers/serverLog";
import {ICompany} from "@coreModule/database/schemas/company/company";
import {IUser} from "@coreModule/database/schemas/user/user";
import {demoSeedTag} from "@coreModule/database/demo/demoSeed";

export type ProviderProfileSeed = {
    seedKey: string;
    bio: string;
    skills: string[];
    availability?: {dayOfWeek: number; startTime: string; endTime: string}[];
    /** IANA zone of `availability`; omitted uses the company's zone (D105). */
    timezone?: string;
};

const weekdayBusinessHours = [
    {dayOfWeek: 1, startTime: "09:00", endTime: "17:00"},
    {dayOfWeek: 2, startTime: "09:00", endTime: "17:00"},
    {dayOfWeek: 3, startTime: "09:00", endTime: "17:00"},
    {dayOfWeek: 4, startTime: "09:00", endTime: "17:00"},
    {dayOfWeek: 5, startTime: "09:00", endTime: "17:00"},
];

export const defaultProviderProfileSeeds: readonly ProviderProfileSeed[] = [
    {
        seedKey: "profile-provider",
        bio: "DEMO marketplace provider — full-stack designer/developer with 10+ years across branding, React/Node web apps, and mobile MVPs. Available weekdays for kickoffs and delivery reviews.",
        skills: [
            "Logo Design",
            "Web Development",
            "React",
            "Node.js",
            "React Native",
            "SEO",
            "Video Editing",
            "Product Photography",
        ],
        availability: weekdayBusinessHours,
        timezone: "Europe/Tirane",
    },
];

export type CreateProviderProfilesResult = {
    providerProfiles: HydratedDocument<IProviderProfile>[];
    bySeedKey: Record<string, HydratedDocument<IProviderProfile>>;
};

export async function createProviderProfiles(
    parentLogger: serverLogger,
    company: ICompany,
    providerUser: IUser,
): Promise<CreateProviderProfilesResult> {
    const logger = getLogger("mongoDbInitialization-createProviderProfiles", parentLogger);
    logger.start("Creating provider profiles...");

    const usersBySeedKey: Record<string, IUser> = {
        "profile-provider": providerUser,
    };

    const providerProfiles: HydratedDocument<IProviderProfile>[] = [];
    const bySeedKey: Record<string, HydratedDocument<IProviderProfile>> = {};

    for (const seed of defaultProviderProfileSeeds) {
        try {
            const user = usersBySeedKey[seed.seedKey];
            if (!user) {
                logger.warn(`Skipping profile "${seed.seedKey}": user mapping not found`);
                continue;
            }

            const seedTag = demoSeedTag(seed.seedKey);
            let existing = await ProviderProfile.findOne({
                company: company._id,
                user: user._id,
            });

            const payload = {
                user: user._id,
                company: company._id,
                bio: seed.bio,
                skills: seed.skills,
                availability: seed.availability ?? [],
                ...(seed.timezone && {timezone: seed.timezone}),
                createdBy: user._id,
            };

            if (!existing) {
                existing = await ProviderProfile.create(payload);
                logger.debug(`Successfully created provider profile (${seedTag})`);
            } else {
                existing.set(payload);
                await existing.save();
                logger.debug(`Provider profile (${seedTag}) already exists; updated fields`);
            }

            providerProfiles.push(existing);
            bySeedKey[seed.seedKey] = existing;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.err(`Error creating provider profile '${seed.seedKey}': ${message}`);
        }
    }

    if (providerProfiles.length === 0) {
        logger.fail("Failed to create provider profiles!");
    } else {
        logger.finish("Finished creating provider profiles!", providerProfiles.length);
    }

    return {providerProfiles, bySeedKey};
}

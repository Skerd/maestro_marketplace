import notificationTexts from "armonia/src/modules/marketplace/helpers/static/notificationTypes/en_US.json";
import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {ObjectId} from "mongodb";
import type {createAndPushNotification} from "@coreModule/domain/notifications/notificationDomainService";

const mocks = vi.hoisted(() => ({createAndPush: vi.fn<Parameters<typeof createAndPushNotification>, Promise<object>>()}));

// The notification itself is recorded, not stored or pushed.
vi.mock("@coreModule/domain/notifications/notificationDomainService", () => ({createAndPushNotification: mocks.createAndPush}));

import {notificationEventBus} from "@coreModule/domain/notifications/notificationEventBus";
import {registerMarketplaceNotificationHandlers} from "@marketplaceModule/domain/notifications/marketplaceNotificationHandlers";
import {NotificationEventCodes} from "@marketplaceModule/domain/notifications/notificationEventCodes";

const companyId = new ObjectId().toString();
const receiver = new ObjectId().toString();

async function paramsOf(code: string, payload: Record<string, unknown>) {
    mocks.createAndPush.mockReset().mockResolvedValue({});
    notificationEventBus.emit(code, {code, receiverIds: [receiver], payload: {companyId, ...payload}});
    await vi.waitFor(() => expect(mocks.createAndPush).toHaveBeenCalledTimes(1));
    return mocks.createAndPush.mock.calls[0][0].params;
}

beforeAll(() => {
    registerMarketplaceNotificationHandlers();
});

beforeEach(() => {
    mocks.createAndPush.mockReset().mockResolvedValue({});
});

// TD-B173: marketplace notices stored only English text, so they were neither translated nor listed to turn off.
describe("marketplace notices carry their message values (D117)", () => {
    it("names the task, the listing, the service order and its milestone", async () => {
        expect(await paramsOf(NotificationEventCodes.BID_ACCEPTED, {taskRequestTitle: "Paint the hall"})).toEqual({task: "Paint the hall"});
        expect(await paramsOf(NotificationEventCodes.ORDER_CREATED_FROM_LISTING, {listingTitle: "Logo design"})).toEqual({listing: "Logo design"});
        expect(await paramsOf(NotificationEventCodes.ORDER_EXTENDED, {orderName: "Logo", additionalDays: 3})).toEqual({order: "Logo", days: 3});
        expect(await paramsOf(NotificationEventCodes.ORDER_MILESTONE_RELEASED, {orderName: "Logo", milestoneName: "Draft"}))
            .toEqual({order: "Logo", milestone: "Draft"});
    });

    it("has a message and title for every code in the shared texts (D128)", () => {
        const codes: Record<string, {title?: string; message?: string}> = notificationTexts.marketplace.codes;
        for (const code of Object.values(NotificationEventCodes)) {
            expect(codes[code]?.title, code).toBeTruthy();
            expect(codes[code]?.message, code).toBeTruthy();
        }
    });
});

import { Device, NotificationPreference } from "../models/index.js";
import { WebPushHelper } from "./WebPushHelper.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

export interface GroupMemberDetail {
  personId: string;
  displayName: string;
}

export interface PushPreview {
  totalMembers: number;
  eligibleCount: number;
  noDeviceCount: number;
  pushDisabledCount: number;
  excludedSenderCount: number;
  webPushDeviceCount: number;
  eligiblePersonIds: string[];
}

// Who a push to a group, or to everyone with the church's app, reaches. Shared by the immediate
// group send and the scheduled-notification dispatcher so both resolve recipients the same way.
export class PushAudienceHelper {
  static async getGroupMemberDetails(churchId: string, groupId: string): Promise<GroupMemberDetail[]> {
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const members: any[] = await membershipRepos.groupMember.loadForGroup(churchId, groupId);
    return members
      .filter((m) => !!m.personId)
      .map((m) => ({
        personId: m.personId,
        displayName: m.person?.name?.display || m.displayName || ""
      }));
  }

  static prefAllowsPush(pref: NotificationPreference | undefined): boolean {
    if (!pref) return true;
    const value = pref.allowPush as any;
    if (Buffer.isBuffer(value)) return value[0] !== 0;
    return value !== false && value !== 0 && value !== "0";
  }

  static async getGroupPushPreview(repos: any, churchId: string, groupId: string, senderPersonId: string): Promise<PushPreview> {
    const members = await this.getGroupMemberDetails(churchId, groupId);
    const memberPersonIds = [...new Set(members.map((m) => m.personId).filter(Boolean))];
    return this.buildPreview(repos, churchId, memberPersonIds, senderPersonId);
  }

  // Everyone in the church with a web-push (PWA) device; the total is those people, not every attendee.
  static async getChurchPushPreview(repos: any, churchId: string, senderPersonId: string): Promise<PushPreview> {
    const devices: Device[] = (await repos.device.loadByChurchId(churchId)) as any[];
    const personIds = [...new Set(devices.filter((d) => !!d.personId && WebPushHelper.isWebPushToken(d.fcmToken)).map((d) => d.personId as string))];
    return this.buildPreview(repos, churchId, personIds, senderPersonId, devices);
  }

  private static async buildPreview(repos: any, churchId: string, audiencePersonIds: string[], senderPersonId: string, loadedDevices?: Device[]): Promise<PushPreview> {
    const senderIsMember = audiencePersonIds.includes(senderPersonId);
    const candidatePersonIds = audiencePersonIds.filter((id) => id !== senderPersonId);
    const candidateSet = new Set(candidatePersonIds);

    const devices: Device[] = loadedDevices || ((await repos.device.loadByChurchId(churchId)) as any[]);
    const webPushDevices = devices.filter((device) => {
      return !!device.personId && candidateSet.has(device.personId) && WebPushHelper.isWebPushToken(device.fcmToken);
    });
    const peopleWithWebPush = new Set(webPushDevices.map((device) => device.personId));

    const prefs: NotificationPreference[] = (await repos.notificationPreference.loadByPersonIds(candidatePersonIds)) as any[];
    const prefByPersonId = new Map<string, NotificationPreference>();
    prefs
      .filter((pref) => pref.churchId === churchId)
      .forEach((pref) => prefByPersonId.set(pref.personId, pref));

    const eligiblePersonIds = candidatePersonIds.filter((personId) => {
      return peopleWithWebPush.has(personId) && this.prefAllowsPush(prefByPersonId.get(personId));
    });

    const pushDisabledCount = candidatePersonIds.filter((personId) => {
      return peopleWithWebPush.has(personId) && !this.prefAllowsPush(prefByPersonId.get(personId));
    }).length;

    return {
      totalMembers: audiencePersonIds.length,
      eligibleCount: eligiblePersonIds.length,
      noDeviceCount: candidatePersonIds.filter((personId) => !peopleWithWebPush.has(personId)).length,
      pushDisabledCount,
      excludedSenderCount: senderIsMember ? 1 : 0,
      webPushDeviceCount: webPushDevices.length,
      eligiblePersonIds
    };
  }
}

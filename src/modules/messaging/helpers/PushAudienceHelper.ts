import { Device, NotificationPreference } from "../models/index.js";
import { WebPushHelper } from "./WebPushHelper.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Repos } from "../repositories/index.js";
import { ForeignGroupMemberRow, MembershipRepos } from "./ForeignRepos.js";

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
    const membershipRepos = await RepoManager.getRepos<MembershipRepos>("membership");
    const members: ForeignGroupMemberRow[] = await membershipRepos.groupMember.loadForGroup(churchId, groupId);
    return members
      .filter((m) => !!m.personId)
      .map((m) => ({
        personId: m.personId,
        displayName: m.person?.name?.display || m.displayName || ""
      }));
  }

  static prefAllowsPush(pref: NotificationPreference | undefined): boolean {
    if (!pref) return true;
    const value: unknown = pref.allowPush;
    if (Buffer.isBuffer(value)) return value[0] !== 0;
    return value !== false && value !== 0 && value !== "0";
  }

  static async getGroupPushPreview(repos: Repos, churchId: string, groupId: string, senderPersonId: string): Promise<PushPreview> {
    const members = await this.getGroupMemberDetails(churchId, groupId);
    const memberPersonIds = [...new Set(members.map((m) => m.personId).filter(Boolean))];
    return this.buildPreview(repos, churchId, memberPersonIds, senderPersonId);
  }

  // Everyone in the church with a web-push (PWA) device; the total is those people, not every attendee.
  static async getChurchPushPreview(repos: Repos, churchId: string, senderPersonId: string): Promise<PushPreview> {
    const devices: Device[] = await repos.device.loadByChurchId(churchId);
    const personIds = [...new Set(devices.filter((d) => !!d.personId && WebPushHelper.isWebPushToken(d.fcmToken)).map((d) => d.personId as string))];
    return this.buildPreview(repos, churchId, personIds, senderPersonId, devices);
  }

  private static async buildPreview(repos: Repos, churchId: string, audiencePersonIds: string[], senderPersonId: string, loadedDevices?: Device[]): Promise<PushPreview> {
    const senderIsMember = audiencePersonIds.includes(senderPersonId);
    const candidatePersonIds = audiencePersonIds.filter((id) => id !== senderPersonId);
    const candidateSet = new Set(candidatePersonIds);

    const devices: Device[] = loadedDevices || (await repos.device.loadByChurchId(churchId));
    const webPushDevices = devices.filter((device) => {
      return !!device.personId && candidateSet.has(device.personId) && WebPushHelper.isWebPushToken(device.fcmToken);
    });
    const peopleWithWebPush = new Set(webPushDevices.map((device) => device.personId));

    const prefs: NotificationPreference[] = await repos.notificationPreference.loadByPersonIds(candidatePersonIds);
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

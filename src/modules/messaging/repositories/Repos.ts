import { BlockedIpRepo, ConnectionRepo, ConversationRepo, DeliveryLogRepo, DeviceRepo, DeviceContentRepo, EmailTemplateRepo, MessageRepo, NotificationRepo, NotificationPreferenceRepo, NotificationPreferenceOverrideRepo, NotificationEntityMuteRepo, ReminderDefinitionRepo, ReminderOccurrenceRepo, ReminderSentLogRepo, PrivateMessageRepo, TextingProviderRepo, SentTextRepo } from "./index.js";

export class Repos {
  public blockedIp: BlockedIpRepo;
  public connection: ConnectionRepo;
  public conversation: ConversationRepo;
  public deliveryLog: DeliveryLogRepo;
  public device: DeviceRepo;
  public deviceContent: DeviceContentRepo;
  public emailTemplate: EmailTemplateRepo;
  public message: MessageRepo;
  public notification: NotificationRepo;
  public notificationPreference: NotificationPreferenceRepo;
  public notificationPreferenceOverride: NotificationPreferenceOverrideRepo;
  public notificationEntityMute: NotificationEntityMuteRepo;
  public reminderDefinition: ReminderDefinitionRepo;
  public reminderOccurrence: ReminderOccurrenceRepo;
  public reminderSentLog: ReminderSentLogRepo;
  public privateMessage: PrivateMessageRepo;
  public textingProvider: TextingProviderRepo;
  public sentText: SentTextRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.blockedIp = new BlockedIpRepo();
    this.connection = new ConnectionRepo();
    this.conversation = new ConversationRepo();
    this.deliveryLog = new DeliveryLogRepo();
    this.device = new DeviceRepo();
    this.deviceContent = new DeviceContentRepo();
    this.emailTemplate = new EmailTemplateRepo();
    this.message = new MessageRepo();
    this.notification = new NotificationRepo();
    this.notificationPreference = new NotificationPreferenceRepo();
    this.notificationPreferenceOverride = new NotificationPreferenceOverrideRepo();
    this.notificationEntityMute = new NotificationEntityMuteRepo();
    this.reminderDefinition = new ReminderDefinitionRepo();
    this.reminderOccurrence = new ReminderOccurrenceRepo();
    this.reminderSentLog = new ReminderSentLogRepo();
    this.privateMessage = new PrivateMessageRepo();
    this.textingProvider = new TextingProviderRepo();
    this.sentText = new SentTextRepo();
  }
}

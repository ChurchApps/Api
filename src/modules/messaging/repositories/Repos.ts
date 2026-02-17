import { BlockedIpRepo, ConnectionRepo, ConversationRepo, DeliveryLogRepo, DeviceRepo, DeviceContentRepo, MessageRepo, NotificationRepo, NotificationPreferenceRepo, PrivateMessageRepo, TextingProviderRepo, SentTextRepo } from "./index.js";

export class Repos {
  public blockedIp: BlockedIpRepo;
  public connection: ConnectionRepo;
  public conversation: ConversationRepo;
  public deliveryLog: DeliveryLogRepo;
  public device: DeviceRepo;
  public deviceContent: DeviceContentRepo;
  public message: MessageRepo;
  public notification: NotificationRepo;
  public notificationPreference: NotificationPreferenceRepo;
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
    this.message = new MessageRepo();
    this.notification = new NotificationRepo();
    this.notificationPreference = new NotificationPreferenceRepo();
    this.privateMessage = new PrivateMessageRepo();
    this.textingProvider = new TextingProviderRepo();
    this.sentText = new SentTextRepo();
  }
}

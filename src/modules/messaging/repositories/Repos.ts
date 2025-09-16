import { BlockedIpRepo, ConnectionRepo, ConversationRepo, DeviceRepo, DeviceContentRepo, MessageRepo, NotificationRepo, NotificationPreferenceRepo, PrivateMessageRepo } from ".";

export class Repos {
  public blockedIp: BlockedIpRepo;
  public connection: ConnectionRepo;
  public conversation: ConversationRepo;
  public device: DeviceRepo;
  public deviceContent: DeviceContentRepo;
  public message: MessageRepo;
  public notification: NotificationRepo;
  public notificationPreference: NotificationPreferenceRepo;
  public privateMessage: PrivateMessageRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.blockedIp = new BlockedIpRepo();
    this.connection = new ConnectionRepo();
    this.conversation = new ConversationRepo();
    this.device = new DeviceRepo();
    this.deviceContent = new DeviceContentRepo();
    this.message = new MessageRepo();
    this.notification = new NotificationRepo();
    this.notificationPreference = new NotificationPreferenceRepo();
    this.privateMessage = new PrivateMessageRepo();
  }
}

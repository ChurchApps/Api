import {
  BlockedIpRepository,
  ConnectionRepository,
  ConversationRepository,
  DeviceRepository,
  DeviceContentRepository,
  MessageRepository,
  NotificationRepository,
  NotificationPreferenceRepository,
  PrivateMessageRepository
} from ".";

export class Repositories {
  public blockedIp: BlockedIpRepository;
  public connection: ConnectionRepository;
  public conversation: ConversationRepository;
  public device: DeviceRepository;
  public deviceContent: DeviceContentRepository;
  public message: MessageRepository;
  public notification: NotificationRepository;
  public notificationPreference: NotificationPreferenceRepository;
  public privateMessage: PrivateMessageRepository;

  private static _current: Repositories = null;
  public static getCurrent = () => {
    if (Repositories._current === null) Repositories._current = new Repositories();
    return Repositories._current;
  };

  constructor() {
    this.blockedIp = new BlockedIpRepository();
    this.connection = new ConnectionRepository();
    this.conversation = new ConversationRepository();
    this.device = new DeviceRepository();
    this.deviceContent = new DeviceContentRepository();
    this.message = new MessageRepository();
    this.notification = new NotificationRepository();
    this.notificationPreference = new NotificationPreferenceRepository();
    this.privateMessage = new PrivateMessageRepository();
  }
}

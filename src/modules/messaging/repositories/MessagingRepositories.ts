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
} from "./index";

/**
 * Repository collection for the Messaging module
 * This class replaces the singleton pattern with the new modular approach
 */
export class MessagingRepositories {
  public blockedIp: BlockedIpRepository;
  public connection: ConnectionRepository;
  public conversation: ConversationRepository;
  public device: DeviceRepository;
  public deviceContent: DeviceContentRepository;
  public message: MessageRepository;
  public notification: NotificationRepository;
  public notificationPreference: NotificationPreferenceRepository;
  public privateMessage: PrivateMessageRepository;

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

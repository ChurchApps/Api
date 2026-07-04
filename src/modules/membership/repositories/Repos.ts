import {
  AssociatedGroupRepo,
  GroupMemberRepo,
  GroupMemberHistoryRepo,
  GroupJoinRequestRepo,
  GroupRepo,
  HouseholdRepo,
  HouseholdPickupPersonRepo,
  ListRepo,
  ListMemberRepo,
  PersonRepo,
  PersonFieldRepo,
  PersonFieldValueRepo,
  AnswerRepo,
  FormRepo,
  FormSubmissionRepo,
  QuestionRepo,
  MemberPermissionRepo,
  DomainRepo,
  SettingRepo,
  ClientErrorRepo,
  VisibilityPreferenceRepo,
  OAuthTokenRepo,
  OAuthCodeRepo,
  OAuthClientRepo,
  OAuthDeviceCodeRepo,
  OAuthRelaySessionRepo,
  WebhookRepo,
  WebhookDeliveryRepo,
  ApiKeyRepo
} from "./index.js";
import { UserRepo, ChurchRepo, RoleRepo, RoleMemberRepo, RolePermissionRepo, UserChurchRepo, AccessLogRepo, AuditLogRepo, BatchRepo, CampusRepo, SiteRepo } from "./index.js";

export class Repos {
  public associatedGroup: AssociatedGroupRepo;
  public groupMember: GroupMemberRepo;
  public groupMemberHistory: GroupMemberHistoryRepo;
  public groupJoinRequest: GroupJoinRequestRepo;
  public group: GroupRepo;
  public household: HouseholdRepo;
  public householdPickupPerson: HouseholdPickupPersonRepo;
  public list: ListRepo;
  public listMember: ListMemberRepo;
  public person: PersonRepo;
  public personField: PersonFieldRepo;
  public personFieldValue: PersonFieldValueRepo;
  public answer: AnswerRepo;
  public form: FormRepo;
  public formSubmission: FormSubmissionRepo;
  public question: QuestionRepo;
  public memberPermission: MemberPermissionRepo;

  public accessLog: AccessLogRepo;
  public campus: CampusRepo;
  public church: ChurchRepo;
  public domain: DomainRepo;
  public site: SiteRepo;
  public role: RoleRepo;
  public roleMember: RoleMemberRepo;
  public rolePermission: RolePermissionRepo;
  public user: UserRepo;
  public userChurch: UserChurchRepo;
  public setting: SettingRepo;
  public visibilityPreference: VisibilityPreferenceRepo;

  public oAuthToken: OAuthTokenRepo;
  public oAuthCode: OAuthCodeRepo;
  public oAuthClient: OAuthClientRepo;
  public oAuthDeviceCode: OAuthDeviceCodeRepo;
  public oAuthRelaySession: OAuthRelaySessionRepo;

  public auditLog: AuditLogRepo;
  public batch: BatchRepo;
  public clientError: ClientErrorRepo;

  public webhook: WebhookRepo;
  public webhookDelivery: WebhookDeliveryRepo;

  public apiKey: ApiKeyRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.associatedGroup = new AssociatedGroupRepo();
    this.groupMember = new GroupMemberRepo();
    this.groupMemberHistory = new GroupMemberHistoryRepo();
    this.groupJoinRequest = new GroupJoinRequestRepo();
    this.group = new GroupRepo();
    this.household = new HouseholdRepo();
    this.householdPickupPerson = new HouseholdPickupPersonRepo();
    this.list = new ListRepo();
    this.listMember = new ListMemberRepo();
    this.person = new PersonRepo();
    this.personField = new PersonFieldRepo();
    this.personFieldValue = new PersonFieldValueRepo();
    this.answer = new AnswerRepo();
    this.form = new FormRepo();
    this.formSubmission = new FormSubmissionRepo();
    this.question = new QuestionRepo();
    this.memberPermission = new MemberPermissionRepo();

    this.accessLog = new AccessLogRepo();
    this.campus = new CampusRepo();
    this.church = new ChurchRepo();
    this.domain = new DomainRepo();
    this.site = new SiteRepo();
    this.role = new RoleRepo();
    this.roleMember = new RoleMemberRepo();
    this.rolePermission = new RolePermissionRepo();
    this.user = new UserRepo();
    this.userChurch = new UserChurchRepo();
    this.setting = new SettingRepo();
    this.visibilityPreference = new VisibilityPreferenceRepo();

    this.oAuthToken = new OAuthTokenRepo();
    this.oAuthCode = new OAuthCodeRepo();
    this.oAuthClient = new OAuthClientRepo();
    this.oAuthDeviceCode = new OAuthDeviceCodeRepo();
    this.oAuthRelaySession = new OAuthRelaySessionRepo();

    this.auditLog = new AuditLogRepo();
    this.batch = new BatchRepo();
    this.clientError = new ClientErrorRepo();

    this.webhook = new WebhookRepo();
    this.webhookDelivery = new WebhookDeliveryRepo();

    this.apiKey = new ApiKeyRepo();
  }
}

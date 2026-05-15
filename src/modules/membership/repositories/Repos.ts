import {
  AssociatedGroupRepo,
  GroupMemberRepo,
  GroupJoinRequestRepo,
  GroupRepo,
  HouseholdRepo,
  PersonRepo,
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
  WebhookDeliveryRepo
} from "./index.js";
import { UserRepo, ChurchRepo, RoleRepo, RoleMemberRepo, RolePermissionRepo, UserChurchRepo, AccessLogRepo, AuditLogRepo } from "./index.js";

export class Repos {
  public associatedGroup: AssociatedGroupRepo;
  public groupMember: GroupMemberRepo;
  public groupJoinRequest: GroupJoinRequestRepo;
  public group: GroupRepo;
  public household: HouseholdRepo;
  public person: PersonRepo;
  public answer: AnswerRepo;
  public form: FormRepo;
  public formSubmission: FormSubmissionRepo;
  public question: QuestionRepo;
  public memberPermission: MemberPermissionRepo;

  public accessLog: AccessLogRepo;
  public church: ChurchRepo;
  public domain: DomainRepo;
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
  public clientError: ClientErrorRepo;

  public webhook: WebhookRepo;
  public webhookDelivery: WebhookDeliveryRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.associatedGroup = new AssociatedGroupRepo();
    this.groupMember = new GroupMemberRepo();
    this.groupJoinRequest = new GroupJoinRequestRepo();
    this.group = new GroupRepo();
    this.household = new HouseholdRepo();
    this.person = new PersonRepo();
    this.answer = new AnswerRepo();
    this.form = new FormRepo();
    this.formSubmission = new FormSubmissionRepo();
    this.question = new QuestionRepo();
    this.memberPermission = new MemberPermissionRepo();

    this.accessLog = new AccessLogRepo();
    this.church = new ChurchRepo();
    this.domain = new DomainRepo();
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
    this.clientError = new ClientErrorRepo();

    this.webhook = new WebhookRepo();
    this.webhookDelivery = new WebhookDeliveryRepo();
  }
}

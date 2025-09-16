import {
  GroupMemberRepo,
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
  OAuthClientRepo
} from ".";
import { UserRepo, ChurchRepo, RoleRepo, RoleMemberRepo, RolePermissionRepo, UserChurchRepo, AccessLogRepo } from ".";

export class Repos {
  public groupMember: GroupMemberRepo;
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

  public clientError: ClientErrorRepo;

  public static getCurrent = () => new Repos();

  constructor() {
    this.groupMember = new GroupMemberRepo();
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

    this.clientError = new ClientErrorRepo();
  }
}

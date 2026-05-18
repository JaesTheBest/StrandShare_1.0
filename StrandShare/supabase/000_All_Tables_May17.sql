create table public."Donation_Drive_Allowed_Groups" (
  "Allowed_Group_ID" serial not null,
  "Donation_Drive_ID" integer not null,
  "Organization_ID" integer null,
  "Group_Name" character varying(255) not null,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Created_By" integer null,
  constraint donation_drive_allowed_groups_pkey primary key ("Allowed_Group_ID"),
  constraint donation_drive_allowed_groups_created_by_fkey foreign KEY ("Created_By") references users (user_id),
  constraint donation_drive_allowed_groups_donation_drive_id_fkey foreign KEY ("Donation_Drive_ID") references "Donation_Drive_Requests" ("Donation_Drive_ID") on delete CASCADE,
  constraint donation_drive_allowed_groups_drive_id_fkey foreign KEY ("Donation_Drive_ID") references "Donation_Drive_Requests" ("Donation_Drive_ID") on delete CASCADE,
  constraint donation_drive_allowed_groups_organization_id_fkey foreign KEY ("Organization_ID") references "Organizations" ("Organization_ID"),
  constraint donation_drive_allowed_groups_group_name_not_blank check (
    (
      length(
        TRIM(
          both
          from
            COALESCE("Group_Name", ''::character varying)
        )
      ) > 0
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_donation_drive_allowed_groups_organization_id on public."Donation_Drive_Allowed_Groups" using btree ("Organization_ID") TABLESPACE pg_default;

create index IF not exists idx_donation_drive_allowed_groups_updated_at on public."Donation_Drive_Allowed_Groups" using btree ("Updated_At" desc) TABLESPACE pg_default;

create index IF not exists "idx_Donation_Drive_Allowed_Groups_Donation_Drive_ID" on public."Donation_Drive_Allowed_Groups" using btree ("Donation_Drive_ID") TABLESPACE pg_default;

create trigger trg_set_donation_drive_allowed_groups_updated_at BEFORE
update on "Donation_Drive_Allowed_Groups" for EACH row
execute FUNCTION set_donation_drive_allowed_groups_updated_at ();


create table public."Donation_Drive_Registrations" (
  "Registration_ID" serial not null,
  "Donation_Drive_ID" integer not null,
  "User_ID" integer not null,
  "Registration_Status" character varying(50) not null default 'Approved'::character varying,
  "Attendance_Status" character varying(50) not null default 'Not Marked'::character varying,
  "Registered_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Attendance_Marked_At" timestamp without time zone null,
  constraint donation_drive_registrations_pkey primary key ("Registration_ID"),
  constraint donation_drive_registrations_drive_user_unique unique ("Donation_Drive_ID", "User_ID"),
  constraint donation_drive_registrations_donation_drive_id_fkey foreign KEY ("Donation_Drive_ID") references "Donation_Drive_Requests" ("Donation_Drive_ID"),
  constraint donation_drive_registrations_user_id_fkey foreign KEY ("User_ID") references users (user_id),
  constraint donation_drive_registrations_attendance_status_not_empty check (
    (
      COALESCE(
        TRIM(
          both
          from
            "Attendance_Status"
        ),
        ''::text
      ) <> ''::text
    )
  ),
  constraint donation_drive_registrations_registration_status_no_pending check (
    (
      (
        COALESCE(
          TRIM(
            both
            from
              "Registration_Status"
          ),
          ''::text
        ) <> ''::text
      )
      and (
        lower(
          replace(
            replace(
              replace(
                (
                  COALESCE("Registration_Status", ''::character varying)
                )::text,
                '_'::text,
                ''::text
              ),
              ' '::text,
              ''::text
            ),
            '-'::text,
            ''::text
          )
        ) !~~ 'pending%'::text
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_donation_drive_registrations_drive_id on public."Donation_Drive_Registrations" using btree ("Donation_Drive_ID") TABLESPACE pg_default;

create index IF not exists idx_donation_drive_registrations_user_id on public."Donation_Drive_Registrations" using btree ("User_ID") TABLESPACE pg_default;

create index IF not exists idx_donation_drive_registrations_attendance_status on public."Donation_Drive_Registrations" using btree ("Attendance_Status") TABLESPACE pg_default;

create index IF not exists "idx_Donation_Drive_Registrations_Donation_Drive_ID" on public."Donation_Drive_Registrations" using btree ("Donation_Drive_ID") TABLESPACE pg_default;

create index IF not exists "idx_Donation_Drive_Registrations_User_ID" on public."Donation_Drive_Registrations" using btree ("User_ID") TABLESPACE pg_default;

create trigger trg_set_donation_drive_registrations_updated_at BEFORE
update on "Donation_Drive_Registrations" for EACH row
execute FUNCTION set_donation_drive_registrations_updated_at ();


create table public."Donation_Drive_Requests" (
  "Donation_Drive_ID" serial not null,
  "User_ID" integer null,
  "Organization_ID" integer null,
  "Donation_Requirement_ID" integer null,
  "Event_Title" character varying(255) not null,
  "Event_Overview" text null,
  "Start_Date" timestamp without time zone null,
  "End_Date" timestamp without time zone null,
  "Proposal_Attachment" character varying(255) null,
  "Street" character varying(255) null,
  "Region" character varying(255) null,
  "Barangay" character varying(255) null,
  "City" character varying(255) null,
  "Province" character varying(255) null,
  "Country" character varying(255) null,
  "Longitude" numeric(10, 7) null,
  "Latitude" numeric(10, 7) null,
  "Is_Open_For_All" boolean null default false,
  "Status" character varying(50) null default 'Pending'::character varying,
  "Updated_At" timestamp without time zone null default now(),
  "Donation_Setup_Type" character varying(50) null,
  "Staff_Reviewed_By" integer null,
  "Staff_Reviewed_At" timestamp without time zone null,
  "Super_Admin_Reviewed_By" integer null,
  "Super_Admin_Reviewed_At" timestamp without time zone null,
  "Assigned_Staff_User_ID" integer null,
  "Status_Reason" text null,
  "Completed_By" integer null,
  "Completed_At" timestamp without time zone null,
  "Total_Recipients" integer null,
  "Total_Donations_Collected" integer null,
  "Completion_Notes" text null,
  "Completion_Attachments" jsonb null default '[]'::jsonb,
  "Created_At" timestamp without time zone null default now(),
  "Proposal_Attachment_Bucket" character varying(120) null,
  constraint donation_drive_requests_pkey primary key ("Donation_Drive_ID"),
  constraint donation_drive_requests_completed_by_fkey foreign KEY ("Completed_By") references users (user_id),
  constraint donation_drive_requests_donation_requirement_id_fkey foreign KEY ("Donation_Requirement_ID") references "Donation_Requirements" ("Donation_Requirement_ID"),
  constraint donation_drive_requests_user_id_fkey foreign KEY ("User_ID") references users (user_id),
  constraint donation_drive_requests_organization_id_fkey foreign KEY ("Organization_ID") references "Organizations" ("Organization_ID"),
  constraint donation_drive_requests_staff_reviewed_by_fkey foreign KEY ("Staff_Reviewed_By") references users (user_id),
  constraint donation_drive_requests_super_admin_reviewed_by_fkey foreign KEY ("Super_Admin_Reviewed_By") references users (user_id),
  constraint donation_drive_requests_assigned_staff_user_id_fkey foreign KEY ("Assigned_Staff_User_ID") references users (user_id),
  constraint donation_drive_requests_total_donations_nonnegative check (
    (
      ("Total_Donations_Collected" is null)
      or ("Total_Donations_Collected" >= 0)
    )
  ),
  constraint donation_drive_requests_latitude_range check (
    (
      ("Latitude" is null)
      or (
        ("Latitude" >= ('-90'::integer)::numeric)
        and ("Latitude" <= (90)::numeric)
      )
    )
  ),
  constraint donation_drive_requests_longitude_range check (
    (
      ("Longitude" is null)
      or (
        ("Longitude" >= ('-180'::integer)::numeric)
        and ("Longitude" <= (180)::numeric)
      )
    )
  ),
  constraint donation_drive_requests_total_recipients_nonnegative check (
    (
      ("Total_Recipients" is null)
      or ("Total_Recipients" >= 0)
    )
  ),
  constraint donation_drive_requests_completion_attachments_array check (
    (
      ("Completion_Attachments" is null)
      or (
        jsonb_typeof("Completion_Attachments") = 'array'::text
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_donation_drive_requests_status on public."Donation_Drive_Requests" using btree ("Status") TABLESPACE pg_default;

create index IF not exists idx_donation_drive_requests_assigned_staff on public."Donation_Drive_Requests" using btree ("Assigned_Staff_User_ID") TABLESPACE pg_default;

create index IF not exists idx_donation_drive_requests_end_date on public."Donation_Drive_Requests" using btree ("End_Date") TABLESPACE pg_default;

create index IF not exists "idx_Donation_Drive_Requests_User_ID" on public."Donation_Drive_Requests" using btree ("User_ID") TABLESPACE pg_default;

create index IF not exists "idx_Donation_Drive_Requests_Organization_ID" on public."Donation_Drive_Requests" using btree ("Organization_ID") TABLESPACE pg_default;

create index IF not exists "idx_Donation_Drive_Requests_Status" on public."Donation_Drive_Requests" using btree ("Status") TABLESPACE pg_default;

create index IF not exists idx_donation_drive_requests_organization_id on public."Donation_Drive_Requests" using btree ("Organization_ID") TABLESPACE pg_default;

create index IF not exists idx_donation_drive_requests_updated_at on public."Donation_Drive_Requests" using btree ("Updated_At" desc) TABLESPACE pg_default;

create trigger trg_enforce_donation_drive_status_workflow BEFORE
update on "Donation_Drive_Requests" for EACH row
execute FUNCTION enforce_donation_drive_status_workflow ();

create trigger trg_set_donation_drive_requests_updated_at BEFORE
update on "Donation_Drive_Requests" for EACH row
execute FUNCTION set_donation_drive_requests_updated_at ();


create table public."Donation_Requirements" (
  "Donation_Requirement_ID" serial not null,
  "Minimum_Number_Donor" integer null,
  "Minimum_Hair_Length" numeric(5, 2) null,
  "Chemical_Treatment_Status" boolean null default false,
  "Colored_Hair_Status" boolean null default false,
  "Bleached_Hair_Status" boolean null default false,
  "Rebonded_Hair_Status" boolean null default false,
  "Hair_Texture_Status" character varying(100) null,
  "Notes" text null,
  "Updated_At" timestamp without time zone null default now(),
  "Updated_By" integer null,
  constraint donation_requirements_pkey primary key ("Donation_Requirement_ID"),
  constraint donation_requirements_updated_by_fkey foreign KEY ("Updated_By") references users (user_id),
  constraint donation_requirements_min_donor_nonnegative check (
    (
      ("Minimum_Number_Donor" is null)
      or ("Minimum_Number_Donor" >= 0)
    )
  ),
  constraint donation_requirements_min_hair_length_nonnegative check (
    (
      ("Minimum_Hair_Length" is null)
      or ("Minimum_Hair_Length" >= (0)::numeric)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_donation_requirements_updated_at on public."Donation_Requirements" using btree ("Updated_At" desc) TABLESPACE pg_default;

create trigger trg_set_donation_requirements_updated_at BEFORE
update on "Donation_Requirements" for EACH row
execute FUNCTION set_donation_requirements_updated_at ();


create table public."Donor_Recommendations" (
  "Recommendation_ID" serial not null,
  "Submission_ID" integer not null,
  "Title" character varying(255) null,
  "Recommendation_Text" text not null,
  "Priority_Order" integer null default 1,
  "Created_At" timestamp without time zone null default now(),
  constraint donor_recommendations_pkey primary key ("Recommendation_ID")
) TABLESPACE pg_default;

create index IF not exists "idx_Donor_Recommendations_Submission_ID" on public."Donor_Recommendations" using btree ("Submission_ID") TABLESPACE pg_default;


create table public."Hair_Bundle_Tracking_History" (
  "Tracking_ID" serial not null,
  "Submission_ID" integer not null,
  "Submission_Detail_ID" integer null,
  "Status" character varying(100) null,
  "Title" character varying(255) null,
  "Description" text null,
  "Changed_By" integer null,
  "Updated_At" timestamp without time zone null default now(),
  constraint hair_bundle_tracking_history_pkey primary key ("Tracking_ID"),
  constraint hair_bundle_tracking_history_changed_by_fkey foreign KEY ("Changed_By") references users (user_id),
  constraint hair_bundle_tracking_history_submission_detail_id_fkey foreign KEY ("Submission_Detail_ID") references "Hair_Submission_Details" ("Submission_Detail_ID") on delete CASCADE,
  constraint hair_bundle_tracking_history_submission_id_fkey foreign KEY ("Submission_ID") references "Hair_Submissions" ("Submission_ID") on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists "idx_Hair_Bundle_Tracking_History_Submission_ID" on public."Hair_Bundle_Tracking_History" using btree ("Submission_ID") TABLESPACE pg_default;

create index IF not exists "idx_Hair_Bundle_Tracking_History_Submission_Detail_ID" on public."Hair_Bundle_Tracking_History" using btree ("Submission_Detail_ID") TABLESPACE pg_default;

create index IF not exists idx_hair_bundle_tracking_submission_detail_id on public."Hair_Bundle_Tracking_History" using btree ("Submission_Detail_ID") TABLESPACE pg_default;

create index IF not exists idx_hair_bundle_tracking_submission_id on public."Hair_Bundle_Tracking_History" using btree ("Submission_ID") TABLESPACE pg_default;


create table public."Hair_Submission_Bundles" (
  "Bundle_ID" serial not null,
  "Created_By" integer null,
  "Status" character varying(50) not null default 'In Production'::character varying,
  "Notes" text null,
  "Created_At" timestamp without time zone not null default now(),
  "Wig_Completed_At" timestamp without time zone null,
  "Updated_At" timestamp without time zone not null default now(),
  "Submission_Code" character varying(64) null,
  "Draft_Submission_IDs" jsonb null default '[]'::jsonb,
  constraint Hair_Submission_Bundles_pkey primary key ("Bundle_ID"),
  constraint Hair_Submission_Bundles_Created_By_fkey foreign KEY ("Created_By") references users (user_id) on delete set null,
  constraint hair_submission_bundles_status_check check (
    (
      lower(("Status")::text) = any (
        array[
          'draft'::text,
          'in production'::text,
          'in_production'::text,
          'wig completed'::text,
          'wig_completed'::text,
          'cancelled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submission_Bundles_Status" on public."Hair_Submission_Bundles" using btree ("Status") TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submission_Bundles_Created_By" on public."Hair_Submission_Bundles" using btree ("Created_By") TABLESPACE pg_default;

create unique INDEX IF not exists "idx_Hair_Submission_Bundles_Submission_Code_unique" on public."Hair_Submission_Bundles" using btree ("Submission_Code") TABLESPACE pg_default
where
  ("Submission_Code" is not null);

create index IF not exists "idx_Hair_Submission_Bundles_Draft_Created_By" on public."Hair_Submission_Bundles" using btree ("Created_By") TABLESPACE pg_default
where
  (lower(("Status")::text) = 'draft'::text);

create trigger trg_set_hair_submission_bundles_updated_at BEFORE
update on "Hair_Submission_Bundles" for EACH row
execute FUNCTION set_hair_submission_bundles_updated_at ();


create table public."Hair_Submission_Details" (
  "Submission_Detail_ID" serial not null,
  "Submission_ID" integer not null,
  "Declared_Length" numeric(5, 2) null,
  "Declared_Color" character varying(100) null,
  "Declared_Texture" character varying(100) null,
  "Declared_Density" character varying(100) null,
  "Declared_Condition" character varying(255) null,
  "Is_Chemically_Treated" boolean null default false,
  "Is_Colored" boolean null default false,
  "Is_Bleached" boolean null default false,
  "Is_Rebonded" boolean null default false,
  "Detail_Notes" text null,
  "Status" character varying(50) null default 'Pending'::character varying,
  "Created_At" timestamp without time zone null default now(),
  "Updated_By" integer null,
  "Updated_At" timestamp without time zone null default now(),
  "Hair_Item_Code" character varying null,
  "Hair_Owner_Type" character varying null default 'Self'::character varying,
  "Hair_Owner_Display_Name" character varying null,
  "Relationship_To_Submitter" character varying null,
  "Input_Method" character varying null default 'Manual'::character varying,
  "Consent_Confirmed" boolean null default false,
  "Consent_Confirmed_At" timestamp without time zone null,
  "QR_Token" character varying null,
  "QR_Image_Path" character varying null,
  "QR_Status" character varying null default 'Not Generated'::character varying,
  "QR_Generated_At" timestamp without time zone null,
  "Current_Tracking_Status" character varying null default 'Draft'::character varying,
  "Rejection_Reason" text null,
  constraint hair_submission_details_pkey primary key ("Submission_Detail_ID"),
  constraint Hair_Submission_Details_QR_Token_key unique ("QR_Token"),
  constraint Hair_Submission_Details_Hair_Item_Code_key unique ("Hair_Item_Code"),
  constraint hair_submission_details_submission_id_fkey foreign KEY ("Submission_ID") references "Hair_Submissions" ("Submission_ID") on delete CASCADE,
  constraint hair_submission_details_updated_by_fkey foreign KEY ("Updated_By") references users (user_id) on delete set null,
  constraint hair_submission_details_owner_type_check check (
    (
      ("Hair_Owner_Type")::text = any (
        (
          array[
            'Self'::character varying,
            'Other'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint hair_submission_details_input_method_check check (
    (
      ("Input_Method")::text = any (
        (
          array[
            'Manual'::character varying,
            'AI Analysis'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint hair_submission_details_qr_status_check check (
    (
      ("QR_Status")::text = any (
        (
          array[
            'Not Generated'::character varying,
            'Generated'::character varying,
            'Revoked'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint hair_submission_details_tracking_status_check check (
    (
      ("Current_Tracking_Status")::text = any (
        (
          array[
            'Draft'::character varying,
            'QR Generated'::character varying,
            'Ready for Shipping'::character varying,
            'Submitted'::character varying,
            'Shipped'::character varying,
            'In Transit'::character varying,
            'Received'::character varying,
            'Under QA Review'::character varying,
            'Accepted'::character varying,
            'Rejected'::character varying,
            'Missing'::character varying,
            'Completed'::character varying,
            'Cancelled'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submission_Details_Submission_ID" on public."Hair_Submission_Details" using btree ("Submission_ID") TABLESPACE pg_default;

create index IF not exists idx_hair_submission_details_submission_id on public."Hair_Submission_Details" using btree ("Submission_ID") TABLESPACE pg_default;

create index IF not exists idx_hair_submission_details_qr_token on public."Hair_Submission_Details" using btree ("QR_Token") TABLESPACE pg_default;

create index IF not exists idx_hair_submission_details_hair_item_code on public."Hair_Submission_Details" using btree ("Hair_Item_Code") TABLESPACE pg_default;

create index IF not exists idx_hair_submission_details_tracking_status on public."Hair_Submission_Details" using btree ("Current_Tracking_Status") TABLESPACE pg_default;

create trigger trg_set_hair_item_identifiers BEFORE INSERT on "Hair_Submission_Details" for EACH row
execute FUNCTION set_hair_item_identifiers ();


create table public."Hair_Submission_Images" (
  "Image_ID" serial not null,
  "Submission_Detail_ID" integer not null,
  "File_Path" character varying(255) not null,
  "Image_Type" character varying(100) null,
  "Uploaded_At" timestamp without time zone null default now(),
  constraint hair_submission_images_pkey primary key ("Image_ID"),
  constraint hair_submission_images_submission_detail_id_fkey foreign KEY ("Submission_Detail_ID") references "Hair_Submission_Details" ("Submission_Detail_ID") on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submission_Images_Submission_Detail_ID" on public."Hair_Submission_Images" using btree ("Submission_Detail_ID") TABLESPACE pg_default;


create table public."Hair_Submission_Logistics" (
  "Submission_Logistics_ID" serial not null,
  "Submission_ID" integer not null,
  "Logistics_Type" character varying(50) null,
  "Courier_Name" character varying(100) null,
  "Tracking_Number" character varying(100) null,
  "Shipment_Status" character varying(100) null,
  "Pickup_Scheduled_At" timestamp without time zone null,
  "Pickup_Schedule_Date" date null,
  "Pickup_Approved_At" timestamp without time zone null,
  "Received_By" integer null,
  "Received_At" timestamp without time zone null,
  "Notes" text null,
  "Created_At" timestamp without time zone null default now(),
  constraint hair_submission_logistics_pkey primary key ("Submission_Logistics_ID"),
  constraint hair_submission_logistics_received_by_fkey foreign KEY ("Received_By") references users (user_id),
  constraint hair_submission_logistics_submission_id_fkey foreign KEY ("Submission_ID") references "Hair_Submissions" ("Submission_ID") on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submission_Logistics_Submission_ID" on public."Hair_Submission_Logistics" using btree ("Submission_ID") TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submission_Logistics_Tracking_Number" on public."Hair_Submission_Logistics" using btree ("Tracking_Number") TABLESPACE pg_default;


create table public."Hair_Submission_Logistics_Items" (
  "Logistics_Item_ID" integer generated always as identity not null,
  "Submission_Logistics_ID" integer not null,
  "Submission_Detail_ID" integer not null,
  "Item_Logistics_Status" character varying null default 'Pending'::character varying,
  "Last_Scanned_At" timestamp without time zone null,
  "Received_At" timestamp without time zone null,
  "Received_By" integer null,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  constraint Hair_Submission_Logistics_Items_pkey primary key ("Logistics_Item_ID"),
  constraint hair_submission_logistics_items_unique unique ("Submission_Logistics_ID", "Submission_Detail_ID"),
  constraint hair_submission_logistics_items_detail_fkey foreign KEY ("Submission_Detail_ID") references "Hair_Submission_Details" ("Submission_Detail_ID") on delete CASCADE,
  constraint hair_submission_logistics_items_logistics_fkey foreign KEY ("Submission_Logistics_ID") references "Hair_Submission_Logistics" ("Submission_Logistics_ID") on delete CASCADE,
  constraint hair_submission_logistics_items_received_by_fkey foreign KEY ("Received_By") references users (user_id) on delete set null,
  constraint hair_submission_logistics_items_status_check check (
    (
      ("Item_Logistics_Status")::text = any (
        (
          array[
            'Pending'::character varying,
            'Ready for Shipping'::character varying,
            'Submitted'::character varying,
            'Shipped'::character varying,
            'In Transit'::character varying,
            'Received'::character varying,
            'Missing'::character varying,
            'Cancelled'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_hair_submission_logistics_items_detail_id on public."Hair_Submission_Logistics_Items" using btree ("Submission_Detail_ID") TABLESPACE pg_default;

create index IF not exists idx_hair_submission_logistics_items_logistics_id on public."Hair_Submission_Logistics_Items" using btree ("Submission_Logistics_ID") TABLESPACE pg_default;


create table public."Hair_Submissions" (
  "Submission_ID" serial not null,
  "User_ID" integer not null,
  "Donation_Drive_ID" integer null,
  "Status" character varying(50) null default 'Pending'::character varying,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Bundle_ID" integer null,
  "Submission_Code" character varying(64) null,
  "Donation_Source" character varying null,
  "Donor_Notes" text null,
  "Recipient_Type" character varying null default 'Organization'::character varying,
  "Recipient_Patient_ID" integer null,
  "QR_Status" character varying null default 'Not Generated'::character varying,
  "QR_Generated_At" timestamp without time zone null,
  "Submitted_At" timestamp without time zone null,
  "Cancelled_At" timestamp without time zone null,
  constraint hair_submissions_pkey primary key ("Submission_ID"),
  constraint hair_submissions_bundle_id_fkey foreign KEY ("Bundle_ID") references "Hair_Submission_Bundles" ("Bundle_ID") on delete set null,
  constraint hair_submissions_donation_drive_id_fkey foreign KEY ("Donation_Drive_ID") references "Donation_Drive_Requests" ("Donation_Drive_ID"),
  constraint hair_submissions_recipient_patient_id_fkey foreign KEY ("Recipient_Patient_ID") references "Patients" ("Patient_ID"),
  constraint hair_submissions_user_id_fkey foreign KEY ("User_ID") references users (user_id)
) TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submissions_User_ID" on public."Hair_Submissions" using btree ("User_ID") TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submissions_Donation_Drive_ID" on public."Hair_Submissions" using btree ("Donation_Drive_ID") TABLESPACE pg_default;

create index IF not exists "idx_Hair_Submissions_Status" on public."Hair_Submissions" using btree ("Status") TABLESPACE pg_default;

create unique INDEX IF not exists "idx_Hair_Submissions_Submission_Code_unique" on public."Hair_Submissions" using btree ("Submission_Code") TABLESPACE pg_default
where
  ("Submission_Code" is not null);

create index IF not exists "idx_Hair_Submissions_Bundle_ID" on public."Hair_Submissions" using btree ("Bundle_ID") TABLESPACE pg_default;

create trigger trg_refresh_wig_total_donated_hairs_after_hair_submission_chang
after DELETE on "Hair_Submissions" for EACH row
execute FUNCTION refresh_wig_total_donated_hairs_after_hair_submission_change ();


create table public."Hospital_Representative" (
  "Link_ID" serial not null,
  "Hospital_ID" integer null,
  "User_ID" integer null,
  "Assigned_Date" timestamp without time zone null default now(),
  constraint Hospital_Staff_pkey primary key ("Link_ID"),
  constraint Hospital_Staff_User_ID_unique unique ("User_ID"),
  constraint Hospital_Staff_Hospital_ID_fkey foreign KEY ("Hospital_ID") references "Hospitals" ("Hospital_ID"),
  constraint Hospital_Staff_User_ID_fkey foreign KEY ("User_ID") references users (user_id)
) TABLESPACE pg_default;

create index IF not exists "idx_Hospital_Staff_Hospital_ID" on public."Hospital_Representative" using btree ("Hospital_ID") TABLESPACE pg_default;

create index IF not exists "idx_Hospital_Staff_User_ID" on public."Hospital_Representative" using btree ("User_ID") TABLESPACE pg_default;


create table public."Hospitals" (
  "Hospital_ID" serial not null,
  "Hospital_Name" character varying(255) null,
  "Hospital_Logo" character varying(255) null,
  "Country" character varying(255) null,
  "Region" character varying(255) null,
  "City" character varying(255) null,
  "Barangay" character varying(255) null,
  "Street" character varying(255) null,
  "Contact_Number" character varying(50) null,
  "Hospital_Head_Name" character varying(255) null,
  "Hospital_Head_Title" character varying(255) null,
  "Hospital_Head_Contact_Number" character varying(50) null,
  "Hospital_Head_Email" character varying(255) null,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Latitude" numeric(10, 7) null,
  "Longitude" numeric(10, 7) null,
  "Is_Approved" boolean null default false,
  "Approval_Status" character varying(50) null default 'Pending'::character varying,
  "Approved_By" integer null,
  "Approved_At" timestamp without time zone null,
  "Review_Notes" text null,
  "Province" character varying(255) null,
  "Created_By" integer null,
  "Updated_By" integer null,
  constraint Hospitals_pkey primary key ("Hospital_ID"),
  constraint hospitals_approved_by_fkey foreign KEY ("Approved_By") references users (user_id),
  constraint hospitals_created_by_fkey foreign KEY ("Created_By") references users (user_id),
  constraint hospitals_updated_by_fkey foreign KEY ("Updated_By") references users (user_id),
  constraint hospitals_approval_status_check check (
    (
      lower(
        (
          COALESCE("Approval_Status", 'pending'::character varying)
        )::text
      ) = any (
        array[
          'pending'::text,
          'approved'::text,
          'rejected'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists "idx_Hospitals_Approval_Status" on public."Hospitals" using btree ("Approval_Status") TABLESPACE pg_default;

create index IF not exists "idx_Hospitals_Is_Approved" on public."Hospitals" using btree ("Is_Approved") TABLESPACE pg_default;

create index IF not exists "idx_Hospitals_Province" on public."Hospitals" using btree ("Province") TABLESPACE pg_default;

create index IF not exists "idx_Hospitals_Head_Name" on public."Hospitals" using btree ("Hospital_Head_Name") TABLESPACE pg_default;

create index IF not exists "idx_Hospitals_Head_Email" on public."Hospitals" using btree ("Hospital_Head_Email") TABLESPACE pg_default;


create table public."Notification" (
  "Notification_ID" serial not null,
  "User_ID" integer null,
  "Type" character varying(100) null,
  "Title" character varying(255) null,
  "Message" text null,
  "Status" character varying(50) null default 'Unread'::character varying,
  "Updated_At" timestamp without time zone null default now(),
  constraint notification_pkey primary key ("Notification_ID"),
  constraint notification_user_id_fkey foreign KEY ("User_ID") references users (user_id)
) TABLESPACE pg_default;

create index IF not exists "idx_Notification_User_ID" on public."Notification" using btree ("User_ID") TABLESPACE pg_default;

create index IF not exists "idx_Notification_Status" on public."Notification" using btree ("Status") TABLESPACE pg_default;


create table public."Organization_Members" (
  "Member_ID" serial not null,
  "Organization_ID" integer not null,
  "User_ID" integer not null,
  "Membership_Role" character varying(100) not null default 'Member'::character varying,
  "Is_Primary" boolean not null default false,
  "Status" character varying(50) not null default 'Active'::character varying,
  "Created_By" integer null,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  constraint Organization_Members_pkey primary key ("Member_ID"),
  constraint Organization_Members_Created_By_fkey foreign KEY ("Created_By") references users (user_id),
  constraint Organization_Members_Organization_ID_fkey foreign KEY ("Organization_ID") references "Organizations" ("Organization_ID") on delete CASCADE,
  constraint Organization_Members_User_ID_fkey foreign KEY ("User_ID") references users (user_id) on delete CASCADE,
  constraint Organization_Members_Status_check check (
    (
      lower(("Status")::text) = any (array['active'::text, 'inactive'::text])
    )
  ),
  constraint organization_members_primary_role_check check (
    (
      (not "Is_Primary")
      or (lower(("Membership_Role")::text) = 'leader'::text)
    )
  )
) TABLESPACE pg_default;

create unique INDEX IF not exists "idx_Organization_Members_org_user_unique" on public."Organization_Members" using btree ("Organization_ID", "User_ID") TABLESPACE pg_default;

create unique INDEX IF not exists "idx_Organization_Members_primary_unique" on public."Organization_Members" using btree ("Organization_ID") TABLESPACE pg_default
where
  ("Is_Primary" = true);

create index IF not exists "idx_Organization_Members_Organization_ID" on public."Organization_Members" using btree ("Organization_ID") TABLESPACE pg_default;

create index IF not exists "idx_Organization_Members_User_ID" on public."Organization_Members" using btree ("User_ID") TABLESPACE pg_default;


create table public."Organizations" (
  "Organization_ID" serial not null,
  "Organization_Name" character varying(255) not null,
  "Organization_Type" character varying(100) null,
  "Organization_Logo_URL" character varying(255) null,
  "Street" character varying(255) null,
  "Region" character varying(255) null,
  "Barangay" character varying(255) null,
  "City" character varying(255) null,
  "Province" character varying(255) null,
  "Country" character varying(255) null,
  "Contact_Number" character varying(50) null,
  "Latitude" numeric(10, 7) null,
  "Longitude" numeric(10, 7) null,
  "Created_By" integer null,
  "Updated_By" integer null,
  "Status" character varying(50) null default 'Active'::character varying,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Is_Approved" boolean null default false,
  "Approval_Status" character varying(50) null default 'Pending'::character varying,
  "Approved_By" integer null,
  "Approved_At" timestamp without time zone null,
  "Review_Notes" text null,
  constraint organizations_pkey primary key ("Organization_ID"),
  constraint organizations_approved_by_fkey foreign KEY ("Approved_By") references users (user_id),
  constraint organizations_created_by_fkey foreign KEY ("Created_By") references users (user_id),
  constraint organizations_updated_by_fkey foreign KEY ("Updated_By") references users (user_id),
  constraint organizations_approval_status_check check (
    (
      lower(
        (
          COALESCE("Approval_Status", 'pending'::character varying)
        )::text
      ) = any (
        array[
          'pending'::text,
          'approved'::text,
          'rejected'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists "idx_Organizations_Name" on public."Organizations" using btree ("Organization_Name") TABLESPACE pg_default;

create index IF not exists "idx_Organizations_Approval_Status" on public."Organizations" using btree ("Approval_Status") TABLESPACE pg_default;

create index IF not exists "idx_Organizations_Status" on public."Organizations" using btree ("Status") TABLESPACE pg_default;


create table public."Patients" (
  "Patient_ID" serial not null,
  "User_ID" integer null,
  "Hospital_ID" integer null,
  "Patient_Code" character varying(100) null,
  "Medical_Condition" character varying(255) null,
  "Patient_Picture" character varying(255) null,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Date_of_Diagnosis" date null,
  "Guardian" character varying(255) null,
  "Guardian_Contact_Number" character varying(50) null,
  "Medical_Document" character varying(255) null,
  "Guardian_Relationship" character varying(100) null,
  constraint Patients_pkey primary key ("Patient_ID"),
  constraint Patients_Patient_Code_key unique ("Patient_Code"),
  constraint Patients_User_ID_unique unique ("User_ID"),
  constraint Patients_Hospital_ID_fkey foreign KEY ("Hospital_ID") references "Hospitals" ("Hospital_ID"),
  constraint Patients_User_ID_fkey foreign KEY ("User_ID") references users (user_id)
) TABLESPACE pg_default;

create index IF not exists "idx_Patients_Hospital_ID" on public."Patients" using btree ("Hospital_ID") TABLESPACE pg_default;

create index IF not exists "idx_Patients_User_ID" on public."Patients" using btree ("User_ID") TABLESPACE pg_default;


create table public."Release_Schedules" (
  "Release_Schedule_ID" serial not null,
  "Req_ID" integer not null,
  "Proposed_Release_Date" timestamp without time zone not null,
  "Proposed_By" integer null,
  "Proposal_Note" text null,
  "Hospital_Decision" character varying(50) null default 'Pending'::character varying,
  "Hospital_Decision_By" integer null,
  "Hospital_Decision_At" timestamp without time zone null,
  "Hospital_Decision_Reason" text null,
  "Is_Current" boolean null default true,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  constraint Release_Schedules_pkey primary key ("Release_Schedule_ID"),
  constraint Release_Schedules_Hospital_Decision_By_fkey foreign KEY ("Hospital_Decision_By") references users (user_id),
  constraint Release_Schedules_Proposed_By_fkey foreign KEY ("Proposed_By") references users (user_id),
  constraint Release_Schedules_Req_ID_fkey foreign KEY ("Req_ID") references "Wig_Requests" ("Req_ID")
) TABLESPACE pg_default;

create index IF not exists "idx_Release_Schedules_Req_ID" on public."Release_Schedules" using btree ("Req_ID") TABLESPACE pg_default;

create index IF not exists "idx_Release_Schedules_Is_Current" on public."Release_Schedules" using btree ("Is_Current") TABLESPACE pg_default;

create index IF not exists "idx_Release_Schedules_Hospital_Decision" on public."Release_Schedules" using btree ("Hospital_Decision") TABLESPACE pg_default;

create unique INDEX IF not exists "idx_Release_Schedules_Current_Req_Unique" on public."Release_Schedules" using btree ("Req_ID") TABLESPACE pg_default
where
  ("Is_Current" = true);


create table public."Theme_Presets" (
  "Preset_ID" serial not null,
  "Preset_Name" character varying(100) null,
  "Primary_Color" character varying(20) null,
  "Secondary_Color" character varying(20) null,
  "Tertiary_Color" character varying(20) null,
  "Primary_Text_Color" character varying(20) null,
  "Secondary_Text_Color" character varying(20) null,
  "Tertiary_Text_Color" character varying(20) null,
  "Font_Family" character varying(100) null,
  "Created_At" timestamp without time zone null default now(),
  "Is_Default" boolean not null default false,
  "Is_Deleted" boolean not null default false,
  "Secondary_Font_Family" character varying(100) null,
  "Background_Color" character varying(20) null,
  constraint Theme_Presets_pkey primary key ("Preset_ID")
) TABLESPACE pg_default;

create unique INDEX IF not exists "Theme_Presets_default_unique_idx" on public."Theme_Presets" using btree ("Is_Default") TABLESPACE pg_default
where
  ("Is_Default" = true);

create trigger trg_prevent_default_theme_preset_changes BEFORE DELETE
or
update on "Theme_Presets" for EACH row
execute FUNCTION prevent_default_theme_preset_changes ();


create table public."UI_Settings" (
  "Primary_Color" character varying(20) null,
  "Secondary_Color" character varying(20) null,
  "Tertiary_Color" character varying(20) null,
  "Primary_Text_Color" character varying(20) null,
  "Secondary_Text_Color" character varying(20) null,
  "Tertiary_Text_Color" character varying(20) null,
  "Font_Family" character varying(100) null,
  "Logo_Icon" character varying(255) null,
  "Login_Background_Photo" character varying(255) null,
  "Updated_By" integer null,
  "Updated_At" timestamp without time zone null default now(),
  "Secondary_Font_Family" character varying(100) null,
  "Background_Color" character varying(20) null,
  "Brand_Name" character varying(120) null,
  "Brand_Tagline" character varying(255) null,
  constraint UI_Settings_Updated_By_fkey foreign KEY ("Updated_By") references users (user_id)
) TABLESPACE pg_default;

create unique INDEX IF not exists "UI_Settings_single_row_idx" on public."UI_Settings" using btree ((true)) TABLESPACE pg_default;


create table public."Wig_Allocations" (
  "Allocation_ID" serial not null,
  "Wig_ID" integer not null,
  "Patient_ID" integer null,
  "Wig_Request_ID" integer null,
  "Allocated_By" integer null,
  "Allocated_At" timestamp without time zone null default now(),
  "Release_Status" character varying(50) null default 'Pending'::character varying,
  "Released_At" timestamp without time zone null,
  "Notes" text null,
  constraint wig_allocations_pkey primary key ("Allocation_ID"),
  constraint wig_allocations_allocated_by_fkey foreign KEY ("Allocated_By") references users (user_id),
  constraint wig_allocations_patient_id_fkey foreign KEY ("Patient_ID") references "Patients" ("Patient_ID"),
  constraint wig_allocations_wig_id_fkey foreign KEY ("Wig_ID") references "Wigs" ("Wig_ID") on delete CASCADE,
  constraint wig_allocations_wig_request_id_fkey foreign KEY ("Wig_Request_ID") references "Wig_Requests" ("Req_ID")
) TABLESPACE pg_default;

create index IF not exists "idx_Wig_Allocations_Wig_ID" on public."Wig_Allocations" using btree ("Wig_ID") TABLESPACE pg_default;

create index IF not exists "idx_Wig_Allocations_Wig_Request_ID" on public."Wig_Allocations" using btree ("Wig_Request_ID") TABLESPACE pg_default;

create index IF not exists "idx_Wig_Allocations_Patient_ID" on public."Wig_Allocations" using btree ("Patient_ID") TABLESPACE pg_default;


create table public."Wig_Request_Specifications" (
  "Req_Spec_ID" serial not null,
  "Req_ID" integer null,
  "Preferred_Color" character varying(50) null,
  "Preferred_Length" character varying(50) null,
  "Hair_Texture" character varying(50) null,
  "Cap_Size" character varying(20) null,
  "Style_Preference" character varying(100) null,
  "Special_Notes" text null,
  "AI_Wig_Preview_URL" text null,
  constraint Wig_Request_Specifications_pkey primary key ("Req_Spec_ID"),
  constraint Wig_Request_Specifications_Req_ID_key unique ("Req_ID"),
  constraint Wig_Request_Specifications_Req_ID_fkey foreign KEY ("Req_ID") references "Wig_Requests" ("Req_ID")
) TABLESPACE pg_default;


create table public."Wig_Requests" (
  "Req_ID" serial not null,
  "Patient_ID" integer null,
  "Status" character varying(50) null,
  "Request_Date" timestamp without time zone null default now(),
  "Requested_By" integer null,
  "Approved_By" integer null,
  "Approved_At" timestamp without time zone null,
  "Updated_At" timestamp without time zone null default now(),
  "Pdf_Url" text null,
  "Status_Reason" text null,
  "Hospital_ID" integer null,
  constraint Wig_Requests_pkey primary key ("Req_ID"),
  constraint Wig_Requests_Approved_By_fkey foreign KEY ("Approved_By") references users (user_id),
  constraint Wig_Requests_Hospital_ID_fkey foreign KEY ("Hospital_ID") references "Hospitals" ("Hospital_ID"),
  constraint Wig_Requests_Patient_ID_fkey foreign KEY ("Patient_ID") references "Patients" ("Patient_ID"),
  constraint Wig_Requests_Requested_By_fkey foreign KEY ("Requested_By") references users (user_id),
  constraint wig_requests_status_check check (
    (
      lower((COALESCE("Status", ''::character varying))::text) = any (
        array[
          'pending'::text,
          'accepted - wig allocated'::text,
          'accepted - no wig available'::text,
          'in production'::text,
          'to be release'::text,
          'releasing'::text,
          'released'::text,
          'rejected'::text,
          'cancelled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists "idx_Wig_Requests_Patient_ID" on public."Wig_Requests" using btree ("Patient_ID") TABLESPACE pg_default;

create index IF not exists "idx_Wig_Requests_Requested_By" on public."Wig_Requests" using btree ("Requested_By") TABLESPACE pg_default;

create index IF not exists "idx_Wig_Requests_Approved_By" on public."Wig_Requests" using btree ("Approved_By") TABLESPACE pg_default;

create index IF not exists "idx_Wig_Requests_Status" on public."Wig_Requests" using btree ("Status") TABLESPACE pg_default;


create table public."Wig_Specifications" (
  "Wig_Specification_ID" serial not null,
  "Wig_ID" integer not null,
  "Hair_Length" numeric(5, 2) null,
  "Hair_Color" character varying(100) null,
  "Hair_Texture" character varying(100) null,
  "Hair_Density" character varying(100) null,
  "Cap_Size" character varying(20) null,
  "Created_At" timestamp without time zone not null default now(),
  "Updated_At" timestamp without time zone not null default now(),
  "Style" character varying(120) null,
  constraint Wig_Specifications_pkey primary key ("Wig_Specification_ID"),
  constraint Wig_Specifications_Wig_ID_unique unique ("Wig_ID"),
  constraint Wig_Specifications_Wig_ID_fkey foreign KEY ("Wig_ID") references "Wigs" ("Wig_ID") on delete CASCADE,
  constraint Wig_Specifications_Hair_Length_non_negative check (
    (
      ("Hair_Length" is null)
      or ("Hair_Length" >= (0)::numeric)
    )
  )
) TABLESPACE pg_default;

create index IF not exists "idx_Wig_Specifications_Wig_ID" on public."Wig_Specifications" using btree ("Wig_ID") TABLESPACE pg_default;

create trigger trg_set_wig_specifications_updated_at BEFORE
update on "Wig_Specifications" for EACH row
execute FUNCTION set_wig_specifications_updated_at ();


create table public."Wigs" (
  "Wig_ID" serial not null,
  "Wig_Status" character varying(50) null default 'In Production'::character varying,
  "Created_At" timestamp without time zone null default now(),
  "Updated_At" timestamp without time zone null default now(),
  "Production_Notes" text null,
  "Wig_Name" character varying(255) null,
  "Total_Bundles_Used" integer null default 0,
  "Created_By" integer null,
  "Completed_At" timestamp without time zone null,
  "Bundle_ID" integer null,
  "Total_Donated_Hairs" integer null,
  "Added_By" integer null,
  "Wig_Front_Image_Path" character varying(500) null,
  "Wig_Side_Image_Path" character varying(500) null,
  "Wig_Top_Image_Path" character varying(500) null,
  "Wig_Code" character varying(100) null,
  "Req_ID" integer null,
  constraint Wigs_pkey primary key ("Wig_ID"),
  constraint Wigs_Bundle_ID_unique unique ("Bundle_ID"),
  constraint Wigs_Added_By_fkey foreign KEY ("Added_By") references users (user_id) on delete set null,
  constraint Wigs_Req_ID_fkey foreign KEY ("Req_ID") references "Wig_Requests" ("Req_ID") on delete set null,
  constraint Wigs_Created_By_fkey foreign KEY ("Created_By") references users (user_id),
  constraint Wigs_Bundle_ID_fkey foreign KEY ("Bundle_ID") references "Hair_Submission_Bundles" ("Bundle_ID") on delete set null,
  constraint wigs_wig_status_check check (
    (
      lower(
        (COALESCE("Wig_Status", ''::character varying))::text
      ) = any (
        array[
          'in production'::text,
          'in_production'::text,
          'ready for release'::text,
          'ready_for_release'::text,
          'wig allocated'::text,
          'wig_allocated'::text,
          'releasing'::text,
          'released'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists "idx_Wigs_Wig_Status" on public."Wigs" using btree ("Wig_Status") TABLESPACE pg_default;

create index IF not exists "idx_Wigs_Bundle_ID" on public."Wigs" using btree ("Bundle_ID") TABLESPACE pg_default;

create index IF not exists "idx_Wigs_Added_By" on public."Wigs" using btree ("Added_By") TABLESPACE pg_default;

create index IF not exists "idx_Wigs_Completed_At" on public."Wigs" using btree ("Completed_At" desc) TABLESPACE pg_default;

create unique INDEX IF not exists "idx_Wigs_Wig_Code_unique" on public."Wigs" using btree ("Wig_Code") TABLESPACE pg_default
where
  ("Wig_Code" is not null);

create index IF not exists "idx_Wigs_Req_ID" on public."Wigs" using btree ("Req_ID") TABLESPACE pg_default;

create unique INDEX IF not exists "idx_Wigs_Req_ID_unique" on public."Wigs" using btree ("Req_ID") TABLESPACE pg_default
where
  ("Req_ID" is not null);

create trigger trg_set_wig_code_from_bundle_submission BEFORE INSERT
or
update OF "Bundle_ID",
"Wig_Code" on "Wigs" for EACH row
execute FUNCTION set_wig_code_from_bundle_submission ();

create trigger trg_set_wig_total_donated_hairs_from_bundle BEFORE INSERT
or
update OF "Bundle_ID" on "Wigs" for EACH row
execute FUNCTION set_wig_total_donated_hairs_from_bundle ();

create trigger trg_set_wigs_updated_at BEFORE
update on "Wigs" for EACH row
execute FUNCTION set_wigs_updated_at ();


create table public.audit_logs (
  log_id serial not null,
  user_id integer null,
  action character varying(255) not null,
  description text null,
  time timestamp without time zone null default now(),
  user_email character varying(255) null,
  resource character varying(255) null,
  status character varying(50) null default 'success'::character varying,
  constraint audit_logs_pkey primary key (log_id),
  constraint audit_logs_user_id_fkey foreign KEY (user_id) references users (user_id)
) TABLESPACE pg_default;

create index IF not exists idx_audit_logs_time on public.audit_logs using btree ("time" desc) TABLESPACE pg_default;

create index IF not exists idx_audit_logs_user_id on public.audit_logs using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_audit_logs_user_email on public.audit_logs using btree (user_email) TABLESPACE pg_default;

create index IF not exists idx_audit_logs_action on public.audit_logs using btree (action) TABLESPACE pg_default;


create table public.guardian_consents (
  guardian_consent_id integer generated always as identity not null,
  user_id integer not null,
  guardian_full_name character varying not null,
  guardian_relationship character varying not null,
  guardian_email character varying null,
  guardian_contact_number character varying not null,
  consent_status character varying null default 'Active'::character varying,
  consent_method character varying null default 'Electronic Checkbox'::character varying,
  consent_text_snapshot text null,
  consented_at timestamp without time zone null default now(),
  revoked_at timestamp without time zone null,
  minor_donation_allowed boolean null default true,
  ai_image_processing_allowed boolean null default true,
  public_posting_allowed boolean null default false,
  guardian_id_file_path character varying null,
  consent_document_file_path character varying null,
  guardian_id_verification_status character varying null default 'Pending'::character varying,
  guardian_id_reviewed_by integer null,
  guardian_id_reviewed_at timestamp without time zone null,
  constraint guardian_consents_pkey primary key (guardian_consent_id),
  constraint guardian_consents_guardian_id_reviewed_by_fkey foreign KEY (guardian_id_reviewed_by) references users (user_id),
  constraint guardian_consents_user_id_fkey foreign KEY (user_id) references users (user_id)
) TABLESPACE pg_default;


create table public.legal_documents (
  legal_document_id integer generated always as identity not null,
  document_type character varying not null,
  version character varying not null,
  title character varying not null,
  content text not null,
  is_active boolean null default true,
  effective_at timestamp without time zone null default now(),
  created_at timestamp without time zone null default now(),
  file_path character varying null,
  constraint legal_documents_pkey primary key (legal_document_id)
) TABLESPACE pg_default;

create index IF not exists idx_legal_documents_document_type_created_at on public.legal_documents using btree (document_type, created_at desc) TABLESPACE pg_default;


create table public.user_details (
  user_details_id serial not null,
  user_id integer null,
  photo_path character varying(255) null,
  first_name character varying(255) null,
  middle_name character varying(255) null,
  last_name character varying(255) null,
  suffix character varying(50) null,
  birthdate date null,
  gender character varying(20) null,
  street character varying(255) null,
  region character varying(255) null,
  barangay character varying(255) null,
  city character varying(255) null,
  province character varying(255) null,
  country character varying(255) null,
  contact_number character varying(50) null,
  joined_date date null,
  created_at timestamp without time zone null default now(),
  updated_at timestamp without time zone null default now(),
  latitude numeric(10, 7) null,
  longitude numeric(10, 7) null,
  constraint user_details_pkey primary key (user_details_id),
  constraint user_details_user_id_fkey foreign KEY (user_id) references users (user_id)
) TABLESPACE pg_default;

create unique INDEX IF not exists user_details_user_id_unique_idx on public.user_details using btree (user_id) TABLESPACE pg_default
where
  (user_id is not null);


create table public.user_legal_agreements (
  agreement_id integer generated always as identity not null,
  user_id integer not null,
  legal_document_id integer not null,
  is_accepted boolean null default true,
  accepted_at timestamp without time zone null default now(),
  ip_address character varying null,
  user_agent text null,
  constraint user_legal_agreements_pkey primary key (agreement_id),
  constraint user_legal_agreements_legal_document_id_fkey foreign KEY (legal_document_id) references legal_documents (legal_document_id),
  constraint user_legal_agreements_user_id_fkey foreign KEY (user_id) references users (user_id)
) TABLESPACE pg_default;


create table public.users (
  user_id serial not null,
  auth_user_id uuid null,
  email character varying(255) null,
  role character varying(100) null,
  access_start timestamp without time zone null,
  access_end timestamp without time zone null,
  is_active boolean null,
  created_at timestamp without time zone null default now(),
  updated_at timestamp without time zone null default now(),
  constraint users_pkey primary key (user_id),
  constraint users_auth_user_id_key unique (auth_user_id),
  constraint users_email_key unique (email)
) TABLESPACE pg_default;




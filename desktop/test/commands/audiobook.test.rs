use super::*;

#[test]
fn reports_no_workspace() {
    let error = get_audiobook(&ProjectService::new(), &WorkspaceSession::new(), 1).unwrap_err();
    assert_eq!(error.code.as_str(), "no_workspace");
}

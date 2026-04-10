import { Component } from 'preact';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  PANEL_BG, GOLD_BTN, BEVELED_BTN, INPUT_STYLE,
  FourCorners, OrnamentalDivider,
} from '../lib/medievalTheme';
import { UI } from '../utils/arena/uiSounds';
import { api } from '../utils/serverClient';

const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'ui', label: 'UI / Visual' },
  { value: 'gameplay', label: 'Gameplay' },
  { value: 'performance', label: 'Performance' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

export default class ReportIssueDialog extends Component {
  constructor(props) {
    super(props);
    this.state = {
      title: '',
      description: '',
      category: 'bug',
      submitting: false,
      submitted: false,
      issueNumber: null,
      error: null,
    };
  }

  handleSubmit = async () => {
    const { title, description, category } = this.state;
    if (title.trim().length < 3 || description.trim().length < 10) return;

    this.setState({ submitting: true, error: null });
    try {
      const result = await api.post('/reports', {
        title: title.trim(),
        description: description.trim(),
        category,
        appVersion: this.props.appVersion || null,
        platform: navigator.platform || null,
      });
      this.setState({ submitting: false, submitted: true, issueNumber: result.issueNumber });
    } catch (err) {
      this.setState({ submitting: false, error: err.message || 'Failed to submit report' });
    }
  };

  render() {
    const { onClose } = this.props;
    const { title, description, category, submitting, submitted, issueNumber, error } = this.state;
    const canSubmit = title.trim().length >= 3 && description.trim().length >= 10 && !submitting;

    return (
      <div
        className="fixed inset-0 z-[220] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      >
        <div
          className="relative w-[420px] max-h-[80vh] flex flex-col"
          style={{
            background: PANEL_BG,
            border: `1px solid ${GOLD} 0.25)`,
            borderRadius: '12px',
            boxShadow: '0 0 60px rgba(0,0,0,0.5)',
            isolation: 'isolate',
          }}
        >
          <FourCorners radius={12} />

          <div className="px-5 pt-5 pb-3 shrink-0">
            <h2 className="text-lg font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>
              {submitted ? 'Report Submitted' : 'Report an Issue'}
            </h2>
            {!submitted && (
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
                Describe the problem and we'll look into it.
              </p>
            )}
          </div>

          <OrnamentalDivider className="px-5 shrink-0" />

          <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
            {submitted ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-3">&#x2714;</div>
                <p className="text-sm font-medium mb-1" style={{ color: TEXT_PRIMARY }}>
                  Thank you for your report!
                </p>
                <p className="text-xs" style={{ color: TEXT_MUTED }}>
                  {issueNumber
                    ? `Your report has been filed as issue #${issueNumber}.`
                    : 'Your report has been submitted successfully.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Category */}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest mb-1 block" style={{ color: `${GOLD} 0.45)` }}>
                    Category
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        className="px-3 py-1.5 text-xs font-medium cursor-pointer transition-all"
                        style={{
                          ...(category === cat.value
                            ? { background: `${GOLD} 0.15)`, border: `1px solid ${ACCENT_GOLD}`, color: ACCENT_GOLD }
                            : { ...BEVELED_BTN, color: TEXT_MUTED }),
                          borderRadius: '6px',
                        }}
                        onClick={() => this.setState({ category: cat.value })}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest mb-1 block" style={{ color: `${GOLD} 0.45)` }}>
                    Title
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    placeholder="Brief summary of the issue"
                    value={title}
                    onInput={(e) => this.setState({ title: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg"
                    style={{ ...INPUT_STYLE, color: TEXT_BODY, backgroundColor: '#0e0a06' }}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest mb-1 block" style={{ color: `${GOLD} 0.45)` }}>
                    Description
                  </label>
                  <textarea
                    rows={5}
                    maxLength={2000}
                    placeholder="What happened? What did you expect to happen? Steps to reproduce..."
                    value={description}
                    onInput={(e) => this.setState({ description: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg resize-none"
                    style={{ ...INPUT_STYLE, color: TEXT_BODY, backgroundColor: '#0e0a06' }}
                  />
                  <div className="text-[10px] text-right mt-0.5" style={{ color: TEXT_MUTED }}>
                    {description.length}/2000
                  </div>
                </div>

                {error && (
                  <p className="text-xs" style={{ color: '#e89090' }}>{error}</p>
                )}
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="px-5 pb-5 pt-2 flex justify-end gap-2 shrink-0">
            {submitted ? (
              <button
                type="button"
                className="px-5 py-2 text-sm font-semibold cursor-pointer transition-all"
                style={{ ...GOLD_BTN, borderRadius: '6px' }}
                data-sound={UI.CONFIRM}
                onClick={onClose}
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium cursor-pointer transition-all"
                  style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                  data-sound={UI.CANCEL}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-5 py-2 text-sm font-semibold cursor-pointer transition-all"
                  style={{
                    ...GOLD_BTN,
                    borderRadius: '6px',
                    opacity: canSubmit ? 1 : 0.4,
                    pointerEvents: canSubmit ? 'auto' : 'none',
                  }}
                  data-sound={UI.CONFIRM}
                  onClick={this.handleSubmit}
                >
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}
